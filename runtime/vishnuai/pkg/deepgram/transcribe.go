package deepgram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"vishnu-ai/internal/types"
)

const (
	DefaultDeepgramBaseURL = "https://api.deepgram.com"
	DefaultDeepgramModel   = "nova-3"
	deepgramTimeout        = 10 * time.Minute
)

type TranscribeClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	httpClient *http.Client
}

func NewTranscribeClient(baseURL, apiKey, model, proxy string) *TranscribeClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultDeepgramBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultDeepgramModel
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyURL, err := url.Parse(strings.TrimSpace(proxy)); err == nil && proxyURL.Scheme != "" {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &TranscribeClient{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Model:   strings.TrimSpace(model),
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   deepgramTimeout,
		},
	}
}

type deepgramWord struct {
	Word  string  `json:"word"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type deepgramAlternative struct {
	Transcript string         `json:"transcript"`
	Words      []deepgramWord `json:"words"`
}

type deepgramChannel struct {
	DetectedLanguage string                `json:"detected_language"`
	Alternatives     []deepgramAlternative `json:"alternatives"`
}

type deepgramResponse struct {
	Results struct {
		Channels []deepgramChannel `json:"channels"`
	} `json:"results"`
}

func (c *TranscribeClient) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("Deepgram transcription requires an API key")
	}

	data, err := os.ReadFile(audioFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}

	reqURL := fmt.Sprintf("%s/v1/listen?model=%s&smart_format=true", c.BaseURL, url.QueryEscape(c.Model))
	if strings.TrimSpace(language) != "" {
		reqURL += fmt.Sprintf("&language=%s", url.QueryEscape(strings.TrimSpace(language)))
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, reqURL, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("Token %s", c.APIKey))
	req.Header.Set("Content-Type", "audio/wav")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Deepgram transcription request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Deepgram transcription failed (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	var parsed deepgramResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse Deepgram response: %w", err)
	}

	channels := parsed.Results.Channels
	if len(channels) == 0 || len(channels[0].Alternatives) == 0 {
		return &types.TranscriptionData{
			Language: language,
			Text:     "",
			Words:    []types.Word{},
		}, nil
	}

	alt := channels[0].Alternatives[0]
	detectedLang := channels[0].DetectedLanguage
	if detectedLang == "" {
		detectedLang = language
	}

	result := &types.TranscriptionData{
		Language: detectedLang,
		Text:     strings.TrimSpace(alt.Transcript),
		Words:    make([]types.Word, 0, len(alt.Words)),
	}

	for i, w := range alt.Words {
		if strings.TrimSpace(w.Word) == "" {
			continue
		}
		result.Words = append(result.Words, types.Word{
			Num:   i,
			Text:  strings.TrimSpace(w.Word),
			Start: w.Start,
			End:   w.End,
		})
	}

	return result, nil
}
