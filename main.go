// Zen Geometry Dash - a tiny local web server that serves the game
// and opens it in the default browser. Compiles to a single exe.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

//go:embed web
var webFS embed.FS

func main() {
	content, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}

	// Prefer a stable port so bookmarks keep working, but fall back to
	// any free port if it's taken (e.g. the game is already running).
	ln, err := net.Listen("tcp", "127.0.0.1:8643")
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			panic(err)
		}
	}

	url := fmt.Sprintf("http://%s/", ln.Addr().String())
	fmt.Println()
	fmt.Println("  ★ Zen Geometry Dash is running! ★")
	fmt.Println("  Opening", url, "in your browser...")
	fmt.Println("  Keep this window open while you play. Close it to quit.")
	fmt.Println()

	go func() {
		time.Sleep(300 * time.Millisecond)
		openBrowser(url)
	}()

	handler := http.FileServer(http.FS(content))
	err = http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Never cache, so a new exe version always serves fresh files.
		w.Header().Set("Cache-Control", "no-store")
		handler.ServeHTTP(w, r)
	}))
	if err != nil {
		panic(err)
	}
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		_ = exec.Command("open", url).Start()
	default:
		_ = exec.Command("xdg-open", url).Start()
	}
}
