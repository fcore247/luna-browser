package buildinfo

// Version is injected from wails.json by the build workflow.
var Version = "dev"

// TestMode is set only in separately packaged local test builds.
var TestMode = ""
