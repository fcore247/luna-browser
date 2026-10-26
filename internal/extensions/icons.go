package extensions

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// ImageData accepts only bounded raster images; extension SVG/HTML is never embedded in Luna.
func ImageData(data []byte) string {
	if len(data) == 0 || len(data) > 2<<20 {
		return ""
	}
	mime := http.DetectContentType(data)
	switch mime {
	case "image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon":
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
	}
	return ""
}
func packageIcon(root string) string {
	data, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		return ""
	}
	var manifest struct {
		Icons map[string]string `json:"icons"`
	}
	if json.Unmarshal(data, &manifest) != nil {
		return ""
	}
	sizes := make([]int, 0, len(manifest.Icons))
	for size := range manifest.Icons {
		if n, e := strconv.Atoi(size); e == nil {
			sizes = append(sizes, n)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sizes)))
	for _, size := range sizes {
		name := manifest.Icons[strconv.Itoa(size)]
		if strings.Contains(name, "\\") || filepath.IsAbs(name) {
			continue
		}
		path := filepath.Join(root, filepath.FromSlash(name))
		rel, err := filepath.Rel(root, path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 2<<20 {
			continue
		}
		data, err := os.ReadFile(path)
		if err == nil {
			if icon := ImageData(data); icon != "" {
				return icon
			}
		}
	}
	return ""
}
