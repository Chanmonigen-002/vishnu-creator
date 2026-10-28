package azure

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"vishnu-ai/internal/types"
)

func TestSynthesizeSendsAzureSpeechRequestAndWritesAudio(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/cognitiveservices/v1" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("Ocp-Apim-Subscription-Key") != "azure-key" {
			t.Fatalf("subscription key = %q", r.Header.Get("Ocp-Apim-Subscription-Key"))
		}
		if r.Header.Get("Content-Type") != "application/ssml+xml" {
			t.Fatalf("content type = %q", r.Header.Get("Content-Type"))
		}
		if r.Header.Get("X-Microsoft-OutputFormat") != "audio-24khz-96kbitrate-mono-mp3" {
			t.Fatalf("output format = %q", r.Header.Get("X-Microsoft-OutputFormat"))
		}
		if r.Header.Get("User-Agent") != "VishnuCreator" {
			t.Fatalf("user agent = %q", r.Header.Get("User-Agent"))
		}
		body, _ := io.ReadAll(r.Body)
		ssml := string(body)
		want := `<speak version='1.0' xml:lang='km-KH'><voice xml:lang='km-KH' name='km-KH-SreymomNeural'><prosody rate="+15%">សួស្តី</prosody></voice></speak>`
		if ssml != want {
			t.Fatalf("ssml = %q, want %q", ssml, want)
		}
		_, _ = w.Write([]byte("ID3-test-audio"))
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "speech.mp3")
	client := NewTtsClient(server.URL, "azure-key", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "សួស្តី",
		Voice:      "km-KH-SreymomNeural",
		OutputFile: output,
		Format:     "mp3",
		Speed:      1.15,
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
	content, err := os.ReadFile(output)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if string(content) != "ID3-test-audio" {
		t.Fatalf("output = %q", string(content))
	}
}

func TestSynthesizeWavUsesRiffFormatAndDefaultFidelity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Microsoft-OutputFormat"); got != "riff-24khz-16bit-mono-pcm" {
			t.Fatalf("output format = %q", got)
		}
		_, _ = w.Write([]byte("RIFF-test-audio"))
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "segment.wav")
	client := NewTtsClient(server.URL, "azure-key", "24khz", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "plain",
		Voice:      "km-KH-PisethNeural",
		OutputFile: output,
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
}

func TestSynthesizeHighFidelityModelChooses48khzFormat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Microsoft-OutputFormat"); got != "audio-48khz-192kbitrate-mono-mp3" {
			t.Fatalf("output format = %q", got)
		}
		_, _ = w.Write([]byte("ID3"))
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "azure-key", "48khz", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "plain",
		Voice:      "km-KH-SreymomNeural",
		OutputFile: filepath.Join(t.TempDir(), "speech.mp3"),
	}); err != nil {
		t.Fatalf("synthesize: %v", err)
	}
}

func TestSynthesizeRequiresAPIKeyAndVoice(t *testing.T) {
	client := NewTtsClient("", "", "", "")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{Voice: "km-KH-SreymomNeural"}); err == nil || !strings.Contains(err.Error(), "api key is empty") {
		t.Fatalf("error = %v, want empty api key error", err)
	}
	keyed := NewTtsClient("", "azure-key", "", "")
	if err := keyed.Synthesize(context.Background(), types.TTSSpeechOptions{OutputFile: filepath.Join(t.TempDir(), "out.mp3")}); err == nil || !strings.Contains(err.Error(), "voice is empty") {
		t.Fatalf("error = %v, want empty voice error", err)
	}
}

func TestSynthesizeReportsHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad subscription key", http.StatusUnauthorized)
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "azure-key", "", "")
	err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "text",
		Voice:      "km-KH-SreymomNeural",
		OutputFile: filepath.Join(t.TempDir(), "speech.mp3"),
	})
	if err == nil || !strings.Contains(err.Error(), "HTTP 401") {
		t.Fatalf("error = %v, want HTTP 401", err)
	}
}

func TestListVoicesReturnsKhmerVoices(t *testing.T) {
	client := NewTtsClient("", "azure-key", "", "")
	voices, err := client.ListVoices(context.Background())
	if err != nil {
		t.Fatalf("list voices: %v", err)
	}
	if len(voices) != 2 {
		t.Fatalf("voices = %#v, want 2 Khmer voices", voices)
	}
	if voices[0].Code != "km-KH-SreymomNeural" || !voices[0].Recommended {
		t.Fatalf("first voice = %#v", voices[0])
	}
}
