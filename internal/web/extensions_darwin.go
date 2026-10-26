package web

/*
#include <stdlib.h>
#include "web_darwin.h"
*/
import "C"
import (
	"encoding/json"
	"errors"
	"unsafe"
)

func Extension(op string, args map[string]any) (string, error) {
	b, _ := json.Marshal(map[string]any{"op": op, "args": args})
	s := C.CString(string(b))
	defer C.free(unsafe.Pointer(s))
	raw, err := snapshotVia(func(req C.int) { C.fmwExtension(s, req) })
	if err != nil {
		return "", err
	}
	var result struct {
		Value string `json:"value"`
		Error string `json:"error"`
	}
	if err = json.Unmarshal([]byte(raw), &result); err != nil {
		return "", err
	}
	if result.Error != "" {
		return "", errors.New(result.Error)
	}
	return result.Value, nil
}
