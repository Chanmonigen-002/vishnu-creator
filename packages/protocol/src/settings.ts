export const vishnuCreatorAccentColors = [
  'neutral',
  'blue',
  'cyan',
  'purple',
  'orange',
  'red',
  'custom'
] as const;

export type VishnuCreatorAccentColor = typeof vishnuCreatorAccentColors[number];
export const vishnuCreatorLanguages = ['zh-CN', 'zh-TW', 'en-US', 'sv-SE', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT', 'ru-RU', 'tr-TR', 'id-ID', 'vi-VN', 'hi-IN', 'th-TH', 'fil-PH', 'bn-BD', 'pl-PL', 'uk-UA', 'nl-NL', 'ms-MY', 'da-DK', 'nb-NO', 'fi-FI', 'cs-CZ', 'ro-RO', 'hu-HU', 'el-GR', 'ta-IN', 'te-IN', 'bg-BG', 'sk-SK', 'hr-HR', 'sr-RS', 'ar-SA', 'fa-IR', 'ur-PK', 'he-IL', 'mr-IN', 'gu-IN', 'pa-IN'] as const;
export type VishnuCreatorLanguage = typeof vishnuCreatorLanguages[number];
export const vishnuCreatorLanguagePreferences = ['system', ...vishnuCreatorLanguages] as const;
export type VishnuCreatorLanguagePreference = typeof vishnuCreatorLanguagePreferences[number];
export type VishnuCreatorColorMode = 'light' | 'dark';
export type VishnuCreatorDefaultPermission =
  | 'follow-project'
  | 'follow-global'
  | 'workspace-write'
  | 'danger-full-access';

export type VishnuCreatorUiSettings = {
  language: VishnuCreatorLanguagePreference;
  colorMode: VishnuCreatorColorMode;
  accentColor: VishnuCreatorAccentColor;
  customAccentColor: string;
  defaultPermission: VishnuCreatorDefaultPermission;
};

export type VishnuCreatorUiSettingsResponse = {
  settings: VishnuCreatorUiSettings;
  configured: boolean;
};

export type UpdateVishnuCreatorUiSettingsRequest = Partial<VishnuCreatorUiSettings>;

export type VishnuCreatorStorageSettings = {
  defaultProjectRoot: string;
  outputRoot: string;
};

export type VishnuCreatorStorageSettingsResponse = {
  settings: VishnuCreatorStorageSettings;
  configured: boolean;
};

export type UpdateVishnuCreatorStorageSettingsRequest = Partial<VishnuCreatorStorageSettings>;
