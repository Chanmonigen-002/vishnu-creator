package azure

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"vishnu-ai/internal/types"
)

// Azure Speech REST synthesis. Endpoints and fields follow the official
// Text-to-Speech REST documentation; Khmer voices are listed on the
// language-support page (recorded in docs/providers/provider-research-2026-10.md).

const (
	DefaultAzureBaseURL = "https://southeastasia.tts.speech.microsoft.com"
	// Model selects the output quality: "48khz" maps to high fidelity formats,
	// anything else (including the default "24khz") to the standard set.
	DefaultAzureModel = "24khz"
	azureTimeout = 10 * time.Minute
)

var localePattern = regexp.MustCompile(`^[a-z]{2,3}-[A-Z]{2}`)

type TtsClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	httpClient *http.Client
}

func NewTtsClient(baseURL, apiKey, model, proxy string) *TtsClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultAzureBaseURL
	}
	model = strings.TrimSpace(model)
	if model == "" {
		model = DefaultAzureModel
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyURL, err := url.Parse(strings.TrimSpace(proxy)); err == nil && proxyURL.Scheme != "" {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &TtsClient{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Model:   model,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   azureTimeout,
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
		return fmt.Errorf("azure tts api key is empty")
	}
	voice := strings.TrimSpace(options.Voice)
	if voice == "" {
		return fmt.Errorf("azure tts voice is empty")
	}
	ctx, cancel := context.WithTimeout(ctx, azureTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/cognitiveservices/v1", strings.NewReader(speechSSML(options.Text, voice, options.Speed)))
	if err != nil {
		return err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", c.APIKey)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat(c.Model, speechFormat(options.Format, options.OutputFile)))
	req.Header.Set("User-Agent", "VishnuCreator")
	response, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return fmt.Errorf("azure tts returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
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

// Azure documents a full voice list only for per-resource endpoints, so the
// regional preset ships the documented Khmer voices; other voices can be typed in.
func (c *TtsClient) ListVoices(context.Context) ([]types.TTSVoice, error) {
	return []types.TTSVoice{
		{Code: "km-KH-SreymomNeural", Name: "Sreymom", Language: "km-KH", Gender: "female", Provider: "azure", Kind: "builtin", Recommended: true},
		{Code: "km-KH-PisethNeural", Name: "Piseth", Language: "km-KH", Gender: "male", Provider: "azure", Kind: "builtin"},
	}, nil
}

func outputFormat(model, format string) string {
	if model == "48khz" {
		if format == "wav" {
			return "riff-48khz-16bit-mono-pcm"
		}
		return "audio-48khz-192kbitrate-mono-mp3"
	}
	if format == "wav" {
		return "riff-24khz-16bit-mono-pcm"
	}
	return "audio-24khz-96kbitrate-mono-mp3"
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

// speechSSML mirrors the daemon adapter: ShortNames start with the locale,
// speed is mapped to a signed prosody rate percentage.
func speechSSML(text, voice string, speed float64) string {
	locale := "en-US"
	if match := localePattern.FindString(voice); match != "" {
		locale = match
	}
	escaped := escapeXML(text)
	content := escaped
	if speed != 1 {
		content = fmt.Sprintf(`<prosody rate="%s">%s</prosody>`, ratePercent(speed), escaped)
	}
	return fmt.Sprintf(`<speak version='1.0' xml:lang='%s'><voice xml:lang='%s' name='%s'>%s</voice></speak>`, locale, locale, escapeXML(voice), content)
}

func ratePercent(speed float64) string {
	percent := int64(math.Round((speed - 1) * 100))
	if percent >= 0 {
		return fmt.Sprintf("+%d%%", percent)
	}
	return fmt.Sprintf("%d%%", percent)
}

func escapeXML(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
	return replacer.Replace(value)
}
