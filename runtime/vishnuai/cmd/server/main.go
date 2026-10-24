package main

import (
	"go.uber.org/zap"
	"vishnu-ai/config"
	"vishnu-ai/internal/deps"
	"vishnu-ai/internal/server"
	"vishnu-ai/log"
	"os"
)

func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()

	var err error
	if !config.LoadConfig() {
		return
	}

	if err = config.CheckConfig(); err != nil {
		log.GetLogger().Error("加载配置失败", zap.Error(err))
		return
	}

	if err = deps.CheckDependency(); err != nil {
		log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
		return
	}
	if err = server.StartBackend(); err != nil {
		log.GetLogger().Error("后端服务启动失败", zap.Error(err))
		os.Exit(1)
	}
}
