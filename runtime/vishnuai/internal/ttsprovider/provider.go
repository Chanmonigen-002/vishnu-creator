package ttsprovider

import (
	"fmt"

	"vishnu-ai/config"
	"vishnu-ai/internal/types"
	"vishnu-ai/pkg/aliyun"
	"vishnu-ai/pkg/azure"
	"vishnu-ai/pkg/elevenlabs"
	"vishnu-ai/pkg/fishaudio"
	"vishnu-ai/pkg/minimax"
	"vishnu-ai/pkg/openai"
	"vishnu-ai/pkg/volcengine"
)

func New(provider string) (types.TTSProvider, error) {
	switch provider {
	case "openai":
		return openai.NewTtsClient(
			config.Conf.Tts.Openai.BaseUrl,
			config.Conf.Tts.Openai.ApiKey,
			config.Conf.Tts.Openai.Model,
			config.Conf.App.Proxy,
		), nil
	case "aliyun":
		return aliyun.NewTtsClient(
			config.Conf.Tts.Aliyun.BaseUrl,
			config.Conf.Tts.Aliyun.ApiKey,
			config.Conf.Tts.Aliyun.Model,
			config.Conf.App.Proxy,
		), nil
	case "minimax":
		return minimax.NewTtsClient(
			config.Conf.Tts.Minimax.BaseUrl,
			config.Conf.Tts.Minimax.ApiKey,
			config.Conf.Tts.Minimax.Model,
		), nil
	case "volcengine":
		return volcengine.NewTtsClient(
			config.Conf.Tts.Volcengine.BaseUrl,
			config.Conf.Tts.Volcengine.AppId,
			config.Conf.Tts.Volcengine.AccessToken,
			config.Conf.Tts.Volcengine.Cluster,
			config.Conf.App.Proxy,
		), nil
	case "azure":
		return azure.NewTtsClient(
			config.Conf.Tts.Azure.BaseUrl,
			config.Conf.Tts.Azure.ApiKey,
			config.Conf.Tts.Azure.Model,
			config.Conf.App.Proxy,
		), nil
	case "elevenlabs":
		return elevenlabs.NewTtsClient(
			config.Conf.Tts.Elevenlabs.BaseUrl,
			config.Conf.Tts.Elevenlabs.ApiKey,
			config.Conf.Tts.Elevenlabs.Model,
			config.Conf.App.Proxy,
		), nil
	case "fishaudio":
		return fishaudio.NewTtsClient(
			config.Conf.Tts.Fishaudio.BaseUrl,
			config.Conf.Tts.Fishaudio.ApiKey,
			config.Conf.Tts.Fishaudio.Model,
			config.Conf.App.Proxy,
		), nil
	default:
		return nil, fmt.Errorf("unsupported tts provider: %s", provider)
	}
}
