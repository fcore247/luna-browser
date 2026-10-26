package web

import "browser-mac/internal/winhost"

func Extension(op string, args map[string]any) (string, error) {
	var value string
	err := winhost.Call("extension-"+op, args, &value)
	return value, err
}
