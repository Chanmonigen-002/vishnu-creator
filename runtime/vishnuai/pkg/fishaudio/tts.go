package fishaudio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"vishnu-ai/internal/types"
)

// Fish Audio text-to-speech. Endpoints and fields follow the official API
// reference (recorded in docs/providers/provider-research-2026-10.md); the
// `model` request header carries the model version, voices are model
// reference IDs.

const (
	DefaultFishAudioBaseURL = "https://api.fish.audio"
	DefaultFishAudioModel   = "s2.1-pro-free"
	fishAudioTimeout        = 10 * time.Minute
)

type TtsClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	httpClient *http.Client
}

func NewTtsClient(baseURL, apiKey, model, proxy string) *TtsClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultFishAudioBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultFishAudioModel
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyURL, err := url.Parse(strings.TrimSpace(proxy)); err == nil && proxyURL.Scheme != "" {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &TtsClient{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Model:   strings.TrimSpace(model),
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   fishAudioTimeout,
		},
	}
}

func (c *TtsClient) Text2Speech(text, voice, outputFile string) error {
	return c.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       text,
		Voice:      voice,
		OutputFile: outputFile,
	})
}

func (c *TtsClient) Synthesize(ctx context.Context, options types.TTSSpeechOptions) error {
	if c.APIKey == "" {
		return fmt.Errorf("fishaudio tts api key is empty")
	}
	voice := strings.TrimSpace(options.Voice)
	if voice == "" {
		return fmt.Errorf("fishaudio tts voice is empty")
	}
	requestBody := map[string]any{
		"text":         options.Text,
		"reference_id": voice,
		"format":       speechFormat(options.Format, options.OutputFile),
	}
	speed := options.Speed
	if speed != 0 && speed != 1 {
		requestBody["prosody"] = map[string]any{"speed": speed}
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, fishAudioTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/v1/tts", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("model", c.Model)
	response, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return fmt.Errorf("fishaudio tts returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	if err := os.MkdirAll(filepath.Dir(options.OutputFile), 0755); err != nil {
		return err
	}
	file, err := os.Create(options.OutputFile)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, io.LimitReader(response.Body, 100<<20))
	return err
}

func (c *TtsClient) ListVoices(ctx context.Context) ([]types.TTSVoice, error) {
	headers := map[string]string{"Authorization": "Bearer " + c.APIKey}
	requests := []struct {
		path string
		kind string
	}{
		{"/model?self=true&page_size=100", "custom"},
		{"/model?page_size=50&sort_by=task_count", "builtin"},
	}
	voices := make([]types.TTSVoice, 0, 16)
	seen := make(map[string]bool, 16)
	for _, request := range requests {
		ctx, cancel := context.WithTimeout(ctx, fishAudioTimeout)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+request.path, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		req.Header.Set("Authorization", headers["Authorization"])
		response, err := c.httpClient.Do(req)
		cancel()
		if err != nil {
			return nil, err
		}
		if response.StatusCode != http.StatusOK {
			message, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
			response.Body.Close()
			return nil, fmt.Errorf("fishaudio voice list returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
		}
		var payload struct {
			Items []struct {
				ID        string   `json:"_id"`
				Title     string   `json:"title"`
				Languages []string `json:"languages"`
				Type      string   `json:"type"`
			} `json:"items"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(response.Body, 10<<20)).Decode(&payload)
		response.Body.Close()
		if decodeErr != nil {
			return nil, fmt.Errorf("decode fishaudio voices: %w", decodeErr)
		}
		for _, item := range payload.Items {
			if item.ID == "" || seen[item.ID] || item.Type != "tts" {
				continue
			}
			seen[item.ID] = true
			voice := types.TTSVoice{
				Code:     item.ID,
				Name:     item.Title,
				Provider: "fishaudio",
				Kind:     request.kind,
			}
			if voice.Name == "" {
				voice.Name = item.ID
			}
			if len(item.Languages) > 0 {
				voice.Language = item.Languages[0]
			}
			voices = append(voices, voice)
		}
	}
	return voices, nil
}

func speechFormat(explicit, outputFile string) string {
	format := strings.ToLower(strings.TrimSpace(explicit))
	if format == "mp3" || format == "wav" {
		return format
	}
	if strings.EqualFold(filepath.Ext(outputFile), ".mp3") {
		return "mp3"
	}
	return "wav"
}
