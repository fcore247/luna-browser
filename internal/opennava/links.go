package opennava

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf16"
)

var netflixTitle = regexp.MustCompile(`^/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?/)?(?:watch|title)/([0-9]{1,16})/?$`)
var netflixBrowse = regexp.MustCompile(`^/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?/)?browse/?$`)
var netflixID = regexp.MustCompile(`^[0-9]{1,16}$`)
var arteTitle = regexp.MustCompile(`^/(?:de|fr|en|es|it|pl)/videos/[^/]+`)
var ardTitle = regexp.MustCompile(`^/(?:video|sendung)/[^/]+`)

type Item struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

func programme(raw, title string) (Item, error) {
	invalid := errors.New("Öffne eine Sendung bei ARD, ZDF, ARTE oder Netflix.")
	u, err := url.Parse(raw)
	if err != nil || len(raw) > 16384 || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return Item{}, invalid
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	path := u.EscapedPath()
	if strings.Contains(raw, "\\") || strings.Contains(path, "//") {
		return Item{}, invalid
	}
	for _, segment := range strings.Split(path, "/") {
		if segment == "." || segment == ".." {
			return Item{}, invalid
		}
	}
	switch host {
	case "netflix.com":
		id := ""
		if netflixBrowse.MatchString(path) {
			id = u.Query().Get("jbv")
		}
		if match := netflixTitle.FindStringSubmatch(path); len(match) > 0 {
			id = match[1]
		}
		if !netflixID.MatchString(id) {
			return Item{}, invalid
		}
		path = "/title/" + id
	case "ardmediathek.de":
		if !ardTitle.MatchString(path) {
			return Item{}, invalid
		}
	case "arte.tv":
		if !arteTitle.MatchString(path) {
			return Item{}, invalid
		}
	case "zdf.de":
		if strings.Trim(path, "/") == "" {
			return Item{}, invalid
		}
	default:
		return Item{}, invalid
	}
	canonical := "https://www." + host + path
	if len(canonical) > 2048 {
		return Item{}, invalid
	}
	title = strings.Join(strings.FieldsFunc(title, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }), " ")
	if title == "" {
		return Item{}, errors.New("Gib einen Titel für die Sendung ein.")
	}
	if len(utf16.Encode([]rune(title))) > 240 {
		return Item{}, errors.New("Der Titel darf höchstens 240 Zeichen enthalten.")
	}
	return Item{URL: canonical, Title: title}, nil
}
