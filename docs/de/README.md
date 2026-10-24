<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../images/Vishnu Creator_logo_vector_dark.svg" />
    <img src="../images/Vishnu Creator_logo_vector.svg" alt="Vishnu Creator" width="380" />
  </picture>
  <br />
  Der Open-Source-KI-Arbeitsbereich & Skills für Kreative
</h1>

<p>Verbinde visuelle Kreativwerkzeuge, wiederverwendbare Skills und Agents für Skripte, Videos, Bilder, Stimmen, Avatare, Übersetzungen und Bearbeitung – alles in einem Arbeitsbereich.</p>

<p><strong>Vishnu Creator hieß früher VishnuAI.</strong></p>

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="Vishnu Creator (ehemals VishnuAI): Platz 1 der Repositories des Tages auf Trendshift" width="250" height="55" /></a>

[English](../../README.md) | [简体中文](../zh/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Bahasa Indonesia](../id/README.md) | [Español](../es/README.md) | [Français](../fr/README.md) | **Deutsch** | [Português](../pt/README.md) | [Русский](../ru/README.md) | [العربية](../ar/README.md) | [ภาษาไทย](../th/README.md) | [Türkçe](../tr/README.md) | [हिन्दी](../hi/README.md) | [বাংলা](../bn/README.md) | [اردو](../ur/README.md) | [Tiếng Việt](../vi/README.md) | [Filipino](../fil/README.md)

[![GitHub Stars](https://badgen.net/github/stars/vishnuai/Vishnu Creator?icon=github&label=Stars&color=EAB308)](https://github.com/vishnuai/Vishnu Creator/stargazers)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%E7%B2%89%E4%B8%9D&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![AtomGit G-Star](https://img.shields.io/badge/AtomGit-G--Star-DA203E?style=flat)](https://atomgit.com/vishnuai/Vishnu Creator)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/fUNvbqDaw)
[![QQ-Gruppe](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://qm.qq.com/q/W4YC0PLMeA)

[Highlights](#projekt-highlights) · [Werkzeuge](#kreativwerkzeuge) · [Skills](#skills) · [Beispiele](#beispiele) · [Start](#schnellstart) · [Desktop](#desktop) · [Doku](#dokumentation) · [Community](#community)

</div>

![Vishnu Creator Agent-Arbeitsbereich](../images/vishnucreator-home-en.png)

## Projektüberblick

Vishnu Creator richtet sich an Einzelpersonen und Teams, die kreative Arbeit und Entwicklung lokal ausführen möchten. Anstatt eine eigene Agent-Schleife neu zu implementieren, nutzt Vishnu Creator Codex CLI als Ausführungs-Engine und ergänzt sie um eine stabile lokale Runtime, einen visuellen Arbeitsbereich und einen Desktop-Host.

Vishnu Creator bietet zwei miteinander verbundene Arbeitsweisen:

- **Content-Workspace**: Nutze visuelle Werkzeuge und Kreativvorlagen für Videoübersetzung, Video-Downloads, Thumbnail-Generierung, Bildgenerierung und weitere kreative Aufgaben.
- **Agent-Unterhaltung**: Starte und steuere kreative oder Entwicklungsaufgaben in natürlicher Sprache, organisiere Unterhaltungen nach Projekten, lasse Runs im Hintergrund weiterarbeiten und verwalte Genehmigungen, Anhänge, Dateien, Skills, MCP, Zeitpläne, Benachrichtigungen, Speicher und Diagnosen an einem Ort.

Web ist die einzige Frontend-Implementierung. Desktop lädt denselben Web-Build und ergänzt ausschließlich Funktionen, die das Betriebssystem erfordern, etwa die Auswahl von Verzeichnissen, den Fensterlebenszyklus, das Verhalten im Infobereich und native Benachrichtigungen. Bei identischen Daten und derselben Größe des Inhaltsbereichs teilen beide Plattformen dieselbe allgemeine Benutzeroberfläche und dasselbe Runtime-Verhalten.

## Projekt-Highlights

- 🤖 **Codex-nativ**: Nutze die Agent-Schleife, Modelle, Schlussfolgerungen, Werkzeugaufrufe, Unterhaltungen, Skills und MCP von Codex, ohne eine zweite Ausführungs-Engine pflegen zu müssen.

- 🚀 **Sofort einsatzbereite Desktop-App**: Starte Vishnu Creator direkt über die Desktop-App mit integriertem Codex CLI. Der lokale Runtime startet bei Bedarf und bereitet automatisch ein Standardprojekt vor.

- ⚙️ **Lokale Codex-Konfiguration erkennen**: Beim ersten Start prüft Desktop die vorhandene Codex-Konfiguration und bietet an, eine nutzbare ChatGPT-Anmeldung oder einen API-Schlüssel zu übernehmen. Andere Modellanbieter lassen sich im Einrichtungsdialog konfigurieren.

- 🔄 **Verwaltete Runtime-Komponenten**: Prüfe die mitgelieferte, aktive und neueste yt-dlp-Version, suche regelmäßig nach Updates und aktualisiere manuell. Falls ein Update fehlschlägt, bleibt die aktuell funktionierende Version verfügbar.

- 🎨 **Multimodale Erstellung**: Erstelle und verwalte Videos, Bilder, Audio, Untertitel und Dokumente in einem zusammenhängenden Arbeitsablauf.

- 🧩 **Kreativvorlagen**: Erstelle Bilder und Videos mit wiederverwendbaren Vorlagen, statt Prompts und Einstellungen von Grund auf vorzubereiten.

- 🔗 **Arbeitsablauf mit zwei Modi**: Arbeite wahlweise im visuellen Arbeitsbereich oder über eine Agent-Unterhaltung, während eine gemeinsame Zustandsmaschine Schritte, Fortschritt und Ergebnisse synchron hält.

- 🕘 **Versionierung**: Jede Überarbeitung erstellt eine neue Version und bewahrt frühere Einstellungen und Ergebnisse zur Prüfung und zum Vergleich auf.

- 🧩 **Wiederverwendbare Skills**: Nutze Skills für Video-Workflows, erweitere den Agent mit eigenen Skills und verwalte MCP über die Codex-native Konfiguration.

- 🧠 **Speicher**: Bewahre globalen, projektbezogenen und Thread-Speicher zusammen mit Zusammenfassungen und reproduzierbaren Run-Eingabe-Snapshots auf.

- 🔐 **Lokale Sicherheit**: Daten, Anhänge und Protokolle bleiben standardmäßig lokal und werden durch Genehmigungen und bereinigte Diagnosen geschützt.

- 🌐 **Mehrsprachige Oberfläche**: Web und Desktop bieten 43 Sprachen, automatische Erkennung der Systemsprache, manuelle Auswahl und Rechts-nach-links-Layouts für Arabisch, Persisch, Urdu und Hebräisch.

## Kreativwerkzeuge

Die aktuelle Version enthält sechs Kreativwerkzeuge. Verfügbare Modelle und Dienste hängen von deiner lokalen Codex-Umgebung und den Einstellungen der KI-Dienste ab.

Öffne das Dashboard, um Videos zu übersetzen oder herunterzuladen, Thumbnails oder Bilder zu generieren, Voiceover mit Text to Speech zu erstellen oder Videos mit Seedance zu generieren.

![Vishnu Creator Kreativ-Dashboard](../images/product/vishnucreator-dashboard-en.png)

> Weitere Kreativwerkzeuge werden fortlaufend ergänzt.

**Die Videoübersetzung bietet 123 Ausgangssprachen und 124 Zieloptionen einschließlich Pinyin-Ausgabe.** Suche nach muttersprachlichem, englischem oder chinesischem Namen oder Sprachcode. Die Sprachabdeckung von Spracherkennung und Sprachausgabe hängt vom gewählten Dienst und Modell ab.

- **Nur Untertitel übersetzen**: Importiere eine SRT-Datei, prüfe die Vorschau und übersetze sie ohne Quellvideo, Synchronisation oder Video-Rendering.

- **Erweiterte Untertitelbearbeitung**: Bearbeite Zeiten, teile oder verbinde Untertitel und suche und ersetze Text in einem immersiven Editor mit Wellenform und wiedergabesynchroner Zeitleiste. Prüfe Stile direkt im Video, passe Sprache, Stimme und Ausgabe an und erstelle eine neue Version, ohne frühere Ergebnisse zu verlieren.

- **Erstellung auf einer Seite**: Konfiguriere Bildgenerierung, Videogenerierung und Text to Speech auf einer Seite, mit Modellauswahl, Referenzvorschau, modellspezifischen Bildoptionen und durchsuchbarer Stimmenbibliothek.

- **Mehrsprachige Ausgabe und Fortschritt**: Integrierte Ersatzschriften verbessern komplexe Schriftsysteme und Rechts-nach-links-Untertitel. Verfolge Transkription, Übersetzung, Sprachausgabe und Rendering, soweit verfügbar mit Anzahl erledigter und gesamter Elemente.

<table width="100%">
<thead>
<tr>
<th width="18%">Werkzeug</th>
<th width="14%">Status</th>
<th width="68%">Funktionen</th>
</tr>
</thead>
<tbody>
<tr><td valign="top">Videoübersetzung</td><td valign="top">✅ Verfügbar</td><td>Importiere lokale oder öffentliche Videos; transkribiere sie mit lokalen oder cloudbasierten Whisper-Diensten; nutze den LLM-Kontext für Segmentierung und Ausrichtung von Untertiteln, Terminologie und Übersetzung; konfiguriere zweisprachige Untertitel, Synchronisation oder ein eigenes Sprachbeispiel, Untertitelstile sowie Quer- oder Hochformat und exportiere SRT, Audio oder Video</td></tr>
<tr><td valign="top">Video-Downloader</td><td valign="top">✅ Verfügbar</td><td>Analysiere einzelne öffentliche Videos von YouTube, Bilibili, X, TikTok, Instagram, Douyin, Facebook, Xiaohongshu, Pinterest und Reddit, vergleiche verfügbare Formate und lade Video oder Audio herunter. Manche Plattformen benötigen Cookies. Wenn die Plattform Untertitel anbietet, kannst du die Liste ansehen und SRT herunterladen. Englisch steht zuerst, danach die Oberflächensprache, sofern verfügbar.</td></tr>
<tr><td valign="top">Thumbnail-Generierung</td><td valign="top">✅ Verfügbar</td><td>Kombiniere ein Thema, einen Videolink und optional ein Referenzbild, um mehrere Varianten von Content-Thumbnails zu generieren und zu vergleichen</td></tr>
<tr><td valign="top">Bildgenerierung</td><td valign="top">✅ Verfügbar</td><td>Generiere mit GPT Image / Seedream / Kling Image / Gemini Bilder aus einem Prompt und einem optionalen Referenzbild, lege Seitenverhältnis und Anzahl der Ergebnisse fest und zeige einzelne Bilder in der Vorschau an oder lade sie herunter</td></tr>
<tr><td valign="top">Artikel verfassen</td><td valign="top">✅ Verfügbar</td><td>Erstelle aus Themen, Links, Videos oder Dokumenten editierbare Themenvorschläge, Gliederungen und Artikel; ergänze Bilder und exportiere Markdown, HTML oder PDF.</td></tr>
<tr><td valign="top">Xiaohongshu-Beiträge</td><td valign="top">✅ Verfügbar</td><td>Erstelle Beiträge aus einem Thema oder Ausgangsmaterial mit Auswahl von Zielgruppe, Beitragstyp und Länge; kopiere oder lade das Ergebnis herunter.</td></tr>
<tr><td valign="top">Kurzvideo-Drehbuch</td><td valign="top">✅ Verfügbar</td><td>Erstelle aus Thema oder Material ein drehfertiges Szenenskript für Zielgruppe, Plattform, Dauer und Ton; bearbeite oder exportiere es.</td></tr>
<tr><td valign="top">Strichmännchen-Animation</td><td valign="top">✅ Verfügbar</td><td>Erstelle aus Text oder YouTube-Inhalten Erzählung, Stimme, Storyboard-Bilder mit konsistenten Figuren, Untertitel und eine herunterladbare Animation.</td></tr>
<tr><td valign="top">Automatische Clips</td><td valign="top">In Entwicklung</td><td>Analysiere lange Videos, finde Höhepunkte und verwandle ausgewählte Momente in wiederverwendbare kurze Clips</td></tr>
<tr><td valign="top">Text to Speech</td><td valign="top">✅ Verfügbar</td><td>Verwandle Skripte in Voiceover und wähle Stimme, Tempo und Emotion</td></tr>
<tr><td valign="top">Videogenerierung</td><td valign="top">✅ Verfügbar</td><td>Generiere mit Seedance / Kling / Veo Videos aus Prompts und Referenzbildern und zeige jede Version in der Vorschau an, generiere sie erneut oder lade sie herunter</td></tr>
<tr><td valign="top">Digitaler Avatar</td><td valign="top">In Entwicklung</td><td>Kombiniere Skripte, Stimme und Avatar-Darstellung zu Talking-Head-Videos</td></tr>
</tbody>
</table>

## Kreativvorlagen

Starte direkt mit einer Vorlage, statt Prompts und Einstellungen von Grund auf anzulegen. Entdecke vorgestellte Vorlagen nach Kategorien wie Videoproduktion und Bildgestaltung.

Die Sammlung vereint Vorlagen von Vishnu Creator und unabhängigen Kreativen. Bei Vorlagen Dritter nennt die Detailseite die Urheber und verlinkt auf die Originalquelle.

Öffne eine Vorlage, um ein Beispielergebnis sowie Prompt, Einstellungen, Tags, Autor und Originalquelle zu sehen. Wähle **Diese Vorlage verwenden**, um mit der Vorlage loszulegen, und passe die Eingaben nach Bedarf an.

![Details einer Bildvorlage mit Beispielergebnis, Einstellungen und Prompt](../images/product/creation-templates-detail-apex-summit-en.png)

## Skills

Kreativwerkzeuge bieten visuelle Steuerelemente; Skills geben dem Agent wiederverwendbare Anweisungen und Werkzeug-Workflows. Vishnu Creator enthält Skills für die Videoproduktion im Repository und unterstützt die Verwaltung lokaler Codex Skills.

Das Verzeichnis [`skills/`](../../skills/) im Repository enthält wiederverwendbare Anweisungen für Agents, die die eingebettete VishnuAI CLI bedienen.

| Skill | Funktionen |
| --- | --- |
| [VishnuAI CLI](../../skills/vishnuai-cli/SKILL.md) | Befehle auswählen, Konfiguration prüfen und Fortschritt, Manifeste, Ausgaben und Fehler interpretieren |
| [Untertitel](../../skills/vishnuai-subtitle/SKILL.md) | Plattformuntertitel herunterladen oder Medien transkribieren, Untertitel übersetzen und zweisprachige oder kurze Hochformat-Untertitel erstellen |
| [TTS](../../skills/vishnuai-tts/SKILL.md) | Synchronisation in der Zielsprache aus Untertiteln erzeugen und optional ein synchronisiertes Video erstellen |
| [Querformat-Rendering](../../skills/vishnuai-render-horizontal/SKILL.md) | Querformatvideos mit zweisprachigen Untertiteln oder synchronisiertem Ton und Untertiteln in der Zielsprache rendern |
| [Hochformat-Rendering](../../skills/vishnuai-render-vertical/SKILL.md) | Hochformatvideos mit Titeln, zweisprachigen Untertiteln oder Synchronisation zusammensetzen |
| [Cover](../../skills/vishnuai-cover/SKILL.md) | Ein Coverbild aus einem vollständigen Textprompt erzeugen und Bild sowie finalen Prompt speichern |
| [Pipeline-Planung](../../skills/vishnuai-pipeline/SKILL.md) | Einen mehrstufigen Ausgabeplan im Dry-Run-Modus prüfen; die eigentliche Arbeit über die Skills der einzelnen Stufen ausführen |

### Mit eigenen Skills erweitern

Vishnu Creator unterstützt lokale Codex Skills, die durch `SKILL.md` definiert werden. So kannst du eigene Methoden und Workflows ergänzen, statt nur feste Kreativwerkzeuge zu nutzen. Verfügbare Skills hängen vom aktiven Codex home und den installierten Skills ab; Video-Workflow-Skills erfordern eine konfigurierte CLI und die jeweiligen Dienste. Ein Skill im Repository ist nicht automatisch installiert, und externe Dienste sind nicht zwangsläufig enthalten.

## Unterhaltung und Arbeitsbereich, gemeinsam voran

Beschreibe Aufgaben in natürlicher Sprache und wechsle zu visuellen Werkzeugen, wenn du präzise Kontrolle benötigst.

Die gezeigten Anbieter und Modelle sind Beispiele. Die tatsächliche Verfügbarkeit hängt von Zugangsdaten, Anbieterfreigaben und Plattform ab.

### Präzise Steuerung im Arbeitsbereich

Passe Untertitel, Szenen, Audio und Generierungseinstellungen genau an.

### Flexible Bearbeitung im Dialog

Teile dem Agent mit, was geändert werden soll, und verfeinere das Ergebnis in natürlicher Sprache.

### Synchronisierter Status

Unterhaltung und Arbeitsbereich teilen den aktuellen Aufgabenstatus, sodass du nichts wiederholen musst.

### Unabhängige Versionen

Jede Überarbeitung erstellt eine separate Version, ohne frühere Ergebnisse oder Einstellungen zu überschreiben.

## Unterstützte Modelle

Die Verfügbarkeit von Sprachmodellen richtet sich nach dem Codex-Modellkatalog oder deinem OpenAI-kompatiblen Anbieter. Bild-, Video-, Sprach- und Transkriptionsmodelle verwenden die unter **Einstellungen → KI-Dienste** konfigurierten Dienste.

Die Tabellen zeigen integrierte Anbieterprofile und empfohlene Modelle. Die tatsächliche Verfügbarkeit hängt von Zugangsdaten, Anbieterfreigaben und Plattform ab.

### Sprachmodelle

<table>
<tr>
<td align="center" width="20%"><img src="../images/models/openai.png" alt="OpenAI" width="40" height="40" /><br /><strong>GPT</strong></td>
<td align="center" width="20%"><img src="../images/models/deepseek.png" alt="DeepSeek" width="40" height="40" /><br /><strong>DeepSeek</strong></td>
<td align="center" width="20%"><img src="https://github.com/QwenLM.png?size=80" alt="Qwen" width="40" height="40" /><br /><strong>Qwen</strong></td>
<td align="center" width="20%"><img src="https://github.com/MoonshotAI.png?size=80" alt="Kimi" width="40" height="40" /><br /><strong>Kimi</strong></td>
<td align="center" width="20%"><img src="https://github.com/zai-org.png?size=80" alt="Z.ai" width="40" height="40" /><br /><strong>GLM</strong></td>
</tr>
<tr>
<td align="center" width="20%"><img src="https://github.com/xai-org.png?size=80" alt="xAI" width="40" height="40" /><br /><strong>Grok</strong></td>
<td align="center" width="20%"><img src="../images/models/doubao.svg" alt="Doubao" width="40" height="40" /><br /><strong>Doubao</strong></td>
<td align="center" width="20%"><img src="../images/models/ernie.png" alt="ERNIE" width="40" height="40" /><br /><strong>ERNIE</strong></td>
<td align="center" width="20%"><img src="https://github.com/Tencent-Hunyuan.png?size=80" alt="Tencent Hunyuan" width="40" height="40" /><br /><strong>Hunyuan</strong></td>
<td align="center" width="20%"><img src="https://github.com/MiniMax-AI.png?size=80" alt="MiniMax" width="40" height="40" /><br /><strong>MiniMax</strong></td>
</tr>
</table>

### Bild

<table>
<tr>
<td align="center" width="25%"><img src="../images/models/openai.png" alt="OpenAI" width="40" height="40" /><br /><strong>GPT Image</strong></td>
<td align="center" width="25%"><img src="../images/models/jimeng.png" alt="Jimeng" width="40" height="40" /><br /><strong>Seedream 4.0</strong><br />Jimeng</td>
<td align="center" width="25%"><img src="../images/models/kling.png" alt="Kling" width="40" height="40" /><br /><strong>Kling v2.1</strong><br />Kling Image</td>
<td align="center" width="25%"><img src="../images/models/gemini.png" alt="Gemini" width="40" height="40" /><br /><strong>Nano Banana</strong><br />Gemini 2.5 Flash Image</td>
</tr>
</table>

### Video

<table>
<tr>
<td align="center" width="33%"><img src="../images/models/seedance.png" alt="Seedance" width="40" height="40" /><br /><strong>Seedance 2.5</strong></td>
<td align="center" width="33%"><img src="../images/models/kling.png" alt="Kling" width="40" height="40" /><br /><strong>Kling v2.1 Master</strong></td>
<td align="center" width="33%"><img src="../images/models/gemini.png" alt="Gemini" width="40" height="40" /><br /><strong>Veo 3.1</strong></td>
</tr>
</table>

### Sprache und Transkription

<table>
<tr>
<td align="center" width="16%"><img src="../images/models/openai.png" alt="OpenAI" width="40" height="40" /><br /><strong>Whisper</strong></td>
<td align="center" width="16%"><img src="../images/models/openai.png" alt="OpenAI" width="40" height="40" /><br /><strong>OpenAI TTS</strong></td>
<td align="center" width="16%"><img src="https://github.com/MiniMax-AI.png?size=80" alt="MiniMax" width="40" height="40" /><br /><strong>MiniMax</strong></td>
<td align="center" width="16%"><img src="https://github.com/microsoft.png?size=80" alt="Microsoft" width="40" height="40" /><br /><strong>Edge TTS</strong></td>
<td align="center" width="16%"><img src="https://github.com/aliyun.png?size=80" alt="Alibaba Cloud" width="40" height="40" /><br /><strong>Aliyun Speech</strong></td>
<td align="center" width="16%"><img src="https://github.com/volcengine.png?size=80" alt="Volcengine" width="40" height="40" /><br /><strong>Volcengine Speech</strong></td>
</tr>
</table>

Für lokale Transkription stehen auf unterstützten Plattformen auch faster-whisper, WhisperKit und whisper.cpp bereit.

## Beispiele

### Videoübersetzung

Die folgenden öffentlichen Beispiele entstanden, als Vishnu Creator noch VishnuAI hieß. Sie zeigen den bewährten Arbeitsablauf für Untertitelausrichtung, Übersetzung, Synchronisation und Hochformatvideos, den der Arbeitsbereich Videoübersetzung von Vishnu Creator in einen umfassenderen Agent-Arbeitsablauf integriert.

Das Projekt erzeugte die unten gezeigte Untertiteldatei in einem einzigen Durchlauf aus einem 46-minütigen lokalen Video, ohne manuelle Anpassung der Untertitel. Das veröffentlichte Ergebnis deckt das Video vollständig ab, enthält keine überlappenden Zeilen und bietet eine natürliche Segmentierung sowie eine hochwertige Übersetzung.

![Beispiel für Vishnu Creator Untertitelausrichtung](../images/examples/vishnuai-subtitle-alignment.png)

<table width="100%">
<tr>
<td width="33%">

#### Untertitelübersetzung

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

#### Synchronisation

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>
<td width="33%">

#### Hochformat

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>
</tr>
</table>

> Diese Videobeispiele und das Bild zur Untertitelausrichtung entstanden, als Vishnu Creator noch den Namen VishnuAI verwendete.

### Video-Download

Analysiere öffentliche Videolinks von 10 unterstützten Plattformen, vergleiche die verfügbaren Formate und lade Video oder Audio direkt in das Projekt herunter.

Unterstützte Videoquellen:

<table align="center">
  <tr>
    <td align="center" width="48"><img src="../images/platforms/youtube.png" alt="YouTube" width="24" height="24" /><br /><small><small>YouTube</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/bilibili.png" alt="Bilibili" width="24" height="24" /><br /><small><small>Bilibili</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/x.png" alt="X" width="24" height="24" /><br /><small><small>X</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/tiktok.png" alt="TikTok" width="24" height="24" /><br /><small><small>TikTok</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/instagram.png" alt="Instagram" width="24" height="24" /><br /><small><small>Instagram</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/douyin.png" alt="Douyin" width="24" height="24" /><br /><small><small>Douyin</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/facebook.png" alt="Facebook" width="24" height="24" /><br /><small><small>Facebook</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/xiaohongshu.png" alt="Xiaohongshu" width="24" height="24" /><br /><small><small>Xiaohongshu</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/pinterest.png" alt="Pinterest" width="24" height="24" /><br /><small><small>Pinterest</small></small></td>
    <td align="center" width="48"><img src="../images/platforms/reddit.png" alt="Reddit" width="24" height="24" /><br /><small><small>Reddit</small></small></td>
  </tr>
</table>

Die Verfügbarkeit hängt vom Video und der Region ab; manche Quellen können Plattform-Cookies erfordern. Vishnu Creator importiert Browser-Cookies nicht automatisch.

![Formatauswahl im Vishnu Creator Video-Downloader](../images/examples/video-downloader-formats-and-subtitles-en.png)

### Videogenerierung

Erstelle mit Seedance ein KI-Video aus einem Text-Prompt oder Referenzbild. Konfiguriere Modell, Seitenverhältnis, Auflösung und Dauer. Anschließend kannst du jede Version im Projektarbeitsbereich ansehen, neu generieren oder herunterladen.

![Vishnu Creator Videogenerierung mit Seedance](../images/examples/video-generation-seedance-en.png)

### Strichmännchen-Animation

Vishnu Creator hat diese Sammlung eigener Figuren gemeinsam mit dem Künstler [Harbor Hsia](https://www.behance.net/xiaheyuan1), dem Schöpfer von [Stickman auf Behance](https://www.behance.net/gallery/254715463/Stickman), entwickelt. Die integrierten Figuren bleiben während der Animation konsistent.

![Gemeinsam mit Künstlern entwickelte Vishnu Creator Strichmännchen](../images/examples/stick-figure-characters.webp)

Erstelle aus Text oder YouTube-Inhalten eine Animation mit Skriptprüfung, Erzählung, Timing, Storyboard, Untertiteln, Rendering und herunterladbarem Video.

![Beispielbild einer Vishnu Creator Strichmännchen-Animation](../images/examples/stick-figure-animation-frame.jpg)

## Schnellstart

### Desktop-App installieren

Lade den Installer für macOS Apple Silicon, macOS Intel oder Windows x64 aus dem [neuesten Release](https://github.com/vishnuai/Vishnu Creator/releases/latest) herunter. Desktop benötigt weder Node.js noch pnpm und enthält Codex CLI. Für echte Modellaufgaben ist eine nutzbare ChatGPT-Anmeldung oder API-Schlüssel-Konfiguration nötig.

Beim ersten Start startet Desktop die lokale Runtime, bereitet ein Standardprojekt vor und prüft die lokale Codex-Konfiguration. Falls eine nutzbare Anmeldung oder ein API-Schlüssel samt Modelleinstellungen gefunden wird, wähle **Lokales Codex verwenden und fortfahren**, um sie zu übernehmen. Im selben Einrichtungsdialog kannst du auch einen anderen Modellanbieter konfigurieren.

![Einrichtung des Modellanbieters beim ersten Start von Vishnu Creator Desktop](../images/product/vishnucreator-codex-setup.png)

Nach der Einrichtung kannst du im Eingabefeld eine Aufgabe starten. Bei Problemen hilft das [Benutzerhandbuch](../vishnucreator-user-guide-and-troubleshooting.md).

### Web aus dem Quellcode ausführen

Für Entwicklung oder Nutzung von Web aus dem Quellcode benötigst du:

- Node.js 22 oder neuer
- pnpm 9.15.0, festgelegt über das Feld `packageManager` des Repositorys
- Eine im Terminal verfügbare ausführbare Codex CLI
- Eine gültige Codex CLI-Anmeldung für echte Modellaufgaben

Prüfe zuerst deine lokale Umgebung:

```bash
node --version
pnpm --version
codex --version
```

```bash
git clone https://github.com/vishnuai/Vishnu Creator.git
cd Vishnu Creator
corepack enable
pnpm install
pnpm web:dev
```

Öffne `http://127.0.0.1:19861/`. Der Entwicklungsserver startet den lokalen Daemon bei Bedarf und injiziert über einen Same-Origin-Proxy ein temporäres Runtime-Token, sodass kein Verbindungstoken manuell kopiert werden muss.

Beim ersten Start bereitet die Runtime ein Standardprojekt vor. Das Eingabefeld ist verfügbar, sobald die Verbindung hergestellt ist. So arbeitest du ausschließlich am Daemon:

```bash
pnpm daemon:dev
```

Der Daemon lauscht nur auf einer Loopback-Adresse und gibt seine Verbindungsadresse sowie das temporäre Token einmalig auf stdout aus.

## Desktop

Desktop und Browser verwenden dasselbe React-Frontend aus `apps/web`. Allgemeines Verhalten für Projekte, Unterhaltungen, Aufgaben und Einstellungen ruft dieselben Daemon/API auf. Electron ergänzt lediglich echte Systempfade, Fenstersteuerung, Verhalten im Infobereich und native Benachrichtigungen.

### Entwicklungsmodus

```bash
pnpm desktop:dev
```

### Lokale Paketierung

| Befehl | Ausgabe |
| --- | --- |
| `pnpm desktop:package` | Ein ausführbares Verzeichnis für die aktuelle Plattform zur lokalen Überprüfung |
| `pnpm desktop:dist` | Ein Installationsprogramm für die aktuelle Plattform |
| `pnpm desktop:release` | Der Paketierungs-Einstiegspunkt für eine offizielle Veröffentlichung |
| `pnpm --filter @vishnucreator/desktop verify:package` | Überprüfung eines vorhandenen Desktop-Pakets |

Die Desktop-Paketierung baut Web aus dem aktuellen Arbeitsbereich neu, zeichnet Commit, Dirty-Status, Plattform, Architektur und Web-Hash auf und vergleicht `apps/web/dist` mit den in die Anwendung eingebetteten Ressourcen. Bei Abweichungen schlägt die Paketierung fehl. Einzelheiten zu Signierung, Notarisierung, Windows-Builds und Veröffentlichungsanforderungen findest du im [Desktop-Release-Runbook](../operations/vishnucreator-desktop-release-runbook.md).

## Zentrale Arbeitsabläufe

### Unterhaltungen und Runs

1. Wähle ein Projekt aus oder starte eine neue Unterhaltung.
2. Gib eine Aufgabe ein und wähle Berechtigungsstufe, Profile, Modell und Denkaufwand.
3. Während ein Run aktiv ist, kannst du Folgeaufgaben einreihen oder ihn unterbrechen und sofort fortfahren.
4. Prüfe in der Timeline Zusammenfassungen der Schlussfolgerungen, Werkzeugaufrufe, Dateiänderungen, Genehmigungen und Endergebnisse.
5. Verfolge im Aufgabencenter laufende, abgeschlossene, fehlgeschlagene und durch Genehmigungen blockierte Aufgaben zentral.

### Skills und MCP

- Durchsuche im Plugin-Center den Skill-Marktplatz, den Installationsverlauf und lokal verfügbare Skills.
- Wähle im Eingabefeld mit `/` oder über das Hinzufügen-Menü einen Skill, damit die nächste Aufgabe dessen Arbeitsablauf befolgt.
- Die MCP-Verwaltung verwendet Codex-native Befehle und Konfigurationen, anstatt eine zweite Ausführungs-Engine zu pflegen.
- Vishnu Creator verwendet standardmäßig das aktive `$CODEX_HOME`. Prüfe daher die Auswirkungen, bevor du globale Skills oder die MCP-Konfiguration änderst.

### Zeitpläne und dedizierte Aufgaben-Threads

- Jeder Zeitplan besitzt eine dauerhafte, dedizierte Vishnu Creator-Unterhaltung.
- Automatische Auslöser, manuelle Ausführungen und Folgeaufgaben des Benutzers verwenden diese Unterhaltung erneut und laufen gemäß der Richtlinie `queue` oder `skip` nacheinander ab.
- Beim Löschen eines Zeitplans wird dessen dedizierte Unterhaltung archiviert, während vorhandene Runs, Ergebnisse und der zugrunde liegende Codex-Verlauf erhalten bleiben.
- Das Rotieren oder Wiederherstellen eines zugrunde liegenden Codex-Threads ändert weder den Vishnu Creator-Aufgabeneintrag noch die Seitenroute.

## Vishnu Creator-Systemstruktur

Vishnu Creator behandelt den visuellen Arbeitsbereich und die Agent-Unterhaltung als zwei Oberflächen für dieselbe kreative Aufgabe und nicht als getrennte Arbeitsabläufe. Jeder Kreativablauf wird als Zustandsmaschine modelliert: Quelleingabe, Konfiguration, Generierung, Prüfung, Überarbeitung und Export werden zu eindeutigen Zuständen und Ereignissen. Aktionen im Arbeitsbereich und Befehle in Unterhaltungen gelangen in dieselbe Zustandsmaschine. Der aktuelle Schritt, die Konfiguration, der Fortschritt, die Versionen und die Ergebnisse werden wiederum in beiden Oberflächen dargestellt. So bleiben Arbeitsbereich und Unterhaltung synchron, ohne eine zweite Informationsquelle einzuführen.

Kreative Arbeit ist iterativ, daher überschreiben Überarbeitungen das aktuelle Ergebnis nicht. Jede Korrektur oder Neugenerierung erstellt aus dem bestehenden Zustand des Arbeitsablaufs eine neue Version. Einstellungen und Ergebnisse früherer Versionen bleiben zur Prüfung, zum Vergleich und zur weiteren Bearbeitung erhalten.

```text
+-----------------------------+     +------------------------------------+
| Browser Access              |     | Desktop Host                       |
|                             |     | Shared Web build + Electron        |
+--------------+--------------+     +------------------+-----------------+
               |                                       |
               +-------------------+-------------------+
                                   v
+----------------------------------------------------------------------------+
| Creator Experience / apps/web                                              |
| Dashboard / Creator Tools / Agent Conversation / Settings / Files          |
+-------------------------------------+--------------------------------------+
                                      |
+-------------------------------------v--------------------------------------+
| Collaboration Core                                                         |
| Shared workflow state / Steps / Progress / Results / Versions              |
+-------------------------------------+--------------------------------------+
                                      | Runtime API + SSE
+-------------------------------------v--------------------------------------+
| Local Runtime / apps/daemon                                                 |
| Projects / Runs / Approvals / Schedules / Memory / Notifications           |
| Component status / Update checks / Verified updates / Safe fallback        |
+-------------+------------------------+------------------------+-------------+
              |                        |                        |
              v                        v                        v
+---------------------+  +---------------------+  +-------------------------+
| Local Data          |  | Codex Engine        |  | Media Toolchain         |
| SQLite / Files      |  | CLI / app-server    |  | FFmpeg / yt-dlp         |
| System credentials  |  | Skills / MCP        |  | Whisper / AI services   |
+---------------------+  +---------------------+  +-------------------------+
```

| Vishnu Creator-Komponente | Aufgabe | Implementierung |
| --- | --- | --- |
| Kreativerlebnis | Dashboard, Kreativwerkzeuge, Agent-Unterhaltung, Einstellungen und Dateien | `apps/web` · React 18 · Vite · TypeScript |
| Kollaborationskern | Synchronisiert Arbeitsschritte, Unterhaltungskontext, Fortschritt, Ergebnisse und Überarbeitungen | Gemeinsamer Workflow-Status · `CreatorCollaborationPanel` · Versionsverlauf |
| Lokaler Runtime | Verwaltet Projekte, Runs, Genehmigungen, Zeitpläne, Speicher und Benachrichtigungen | `apps/daemon` · Fastify · Runtime API · SSE |
| Runtime-Komponenten | Verfolgt mitgelieferte, aktive und neueste Versionen, prüft regelmäßig und installiert nur angeforderte Updates | yt-dlp nightly · Update-Prüfung · Rückgriff auf funktionierende Version |
| Codex-Engine | Stellt Agent-Schleife, Sitzungen, Schlussfolgerungen, Werkzeuge, Skills und MCP bereit | Codex CLI · app-server |
| Medienwerkzeuge | Lädt kreative Medien herunter, transkribiert, transformiert, generiert und exportiert sie | yt-dlp · Whisper · FFmpeg · konfigurierte KI-Dienste |
| Lokale Daten | Speichert Projektdaten, Runs, Anhänge, Ausgaben und Zugangsdaten lokal | SQLite · Dateisystem · System-Zugangsdatenverwaltung |
| Desktop-Host | Lädt den gemeinsamen Web-Build und ergänzt Betriebssystemfunktionen | `apps/desktop` · Electron · Preload Bridge |

Grundprinzipien:

- Arbeitsbereich und Agent-Unterhaltung sind synchronisierte Ansichten desselben Arbeitsablaufzustands. Beide senden Ereignisse an dieselbe Zustandsmaschine, anstatt parallele Aufgabenzustände zu pflegen.
- Überarbeitungen erstellen neue Versionen, statt vorhandene Ergebnisse zu ersetzen. Kontext und Ausgabe jeder kreativen Iteration bleiben erhalten.
- Das Frontend startet Codex nicht direkt und hängt nicht von Codex' unbearbeitetem JSONL-Ereignisformat ab.
- Der Daemon verwaltet Prozesslebenszyklus, Ereignisnormalisierung, Persistenz, Genehmigungen, Zeitpläne und die Benachrichtigungs-Outbox.
- Codex bleibt die maßgebliche Ausführungsquelle für Agent-Schleife, Skills und MCP.
- Browser Bridge und Desktop Bridge implementieren keine getrennten Kopien der allgemeinen Produktlogik.

## Repository-Struktur

```text
Vishnu Creator/
├── apps/
│   ├── web/          # Die einzige React-Frontend-Implementierung
│   ├── daemon/       # Lokaler Fastify Runtime und Codex-Adapter
│   ├── desktop/      # Electron Main, Preload, native Funktionen und Paketierung
│   └── harness/      # Kommandozeilenwerkzeug zur Runtime-Überprüfung
├── packages/
│   ├── protocol/     # Von Web, Daemon und Desktop gemeinsam genutzte Runtime-Verträge
│   └── skill-market/ # Modelle des Skill-Marktplatzes und gemeinsame Logik
├── docs/             # Designdokumente, API-Referenzen, Runbooks und Testberichte
├── scripts/          # Repository-weite Prüfungen
└── .runtime/         # Lokale Runtime-Daten, beim ersten Start erstellt
```

## Konfiguration

### API-Schlüssel für KI-Dienste

Öffne **Einstellungen → KI-Dienste**, um die Modell-, Transkriptions-, Audio- und Bildanbieter der aktuellen Arbeitsbereiche zu konfigurieren. Zur Vorbereitung auf kommende Kreativwerkzeuge können zusätzliche Dienstkategorien erscheinen. Jede Kategorie zeigt nur die für den ausgewählten Anbieter erforderlichen Felder an, darunter Base URL, API Key, Modell, Proxy oder anbieterspezifische Zugangsdaten.

![Vishnu Creator Einstellungen für API-Schlüssel von KI-Diensten](../images/product/vishnucreator-ai-services-en.png)

Zugangsdaten werden über den System-Zugangsspeicher der lokalen Runtime gespeichert und dürfen niemals in das Repository committet werden. Einige lokale oder systemgestützte Anbieter wie Edge TTS benötigen keinen API Key.

### Runtime-Komponenten von Drittanbietern

Öffne **Einstellungen → Drittanbieter-Komponenten**, um die derzeit verwendete yt-dlp-nightly-Version, die mit Vishnu Creator gelieferte Version, ihre Quelle und die neueste verfügbare Version zu prüfen. Vishnu Creator sucht alle sieben Tage nach Updates, installiert sie jedoch nie automatisch. Updates erfordern eine ausdrückliche Benutzeraktion. Falls Download, Prüfung oder Installation fehlschlagen, bleibt die aktuell funktionierende Version verfügbar.

![Einstellungen für Vishnu Creator-Drittanbieter-Komponenten](../images/product/vishnucreator-third-party-components-en.png)
### Runtime-Umgebungsvariablen

Die meisten Benutzer benötigen keine Umgebungsvariablen. Verwende sie, wenn du isolierte Daten, eine bestimmte Codex-Programmdatei oder ein benutzerdefiniertes Verzeichnis für verwaltete Projekte benötigst:

| Umgebungsvariable | Standardwert | Zweck |
| --- | --- | --- |
| `VISHNUCREATOR_DATA_DIR` | `.runtime` | Vishnu Creator-Datenbank, Runs, Anhänge und verwaltete Arbeitsbereiche |
| `VISHNUCREATOR_CODEX_BIN` | `codex` | Pfad zur ausführbaren Codex CLI |
| `CODEX_HOME` | `~/.codex` | Maßgebliche Quelle für Codex-Sitzungen, Konfiguration, Skills, MCP und Profiles |
| `VISHNUCREATOR_DEFAULT_CWD` | Aktuelles Arbeitsverzeichnis | Standardarbeitsverzeichnis des Daemons |
| `VISHNUCREATOR_DEFAULT_PROJECT_ROOT` | Runtime-Standardrichtlinie | Stammverzeichnis verwalteter Projekte; wenn festgelegt, verwendet Vishnu Creator dessen Unterverzeichnis `Vishnu Creator/` |
| `VISHNUCREATOR_CODEX_THREAD_ROTATION_RUN_THRESHOLD` | `50` | Schwellenwert beendeter Runs zum Rotieren des Codex-Threads hinter einem lang laufenden Zeitplan; mit `0` wird die proaktive Rotation deaktiviert |

So isolierst du beispielsweise sowohl Runtime-Daten als auch die Codex-Umgebung:

```bash
VISHNUCREATOR_DATA_DIR=/path/to/vishnucreator-data \
CODEX_HOME=/path/to/codex-home \
pnpm web:dev
```

## Daten und Sicherheit

Runtime-Daten werden standardmäßig unter `.runtime/` im Stammverzeichnis des Repositorys gespeichert:

| Pfad | Inhalt |
| --- | --- |
| `.runtime/app.sqlite` | Projekte, Threads, Runs, Ereignisse, Zeitpläne, Benachrichtigungen, Metadaten von Anhängen, Genehmigungen, Speicher und Zusammenfassungen |
| `.runtime/runs/` | Bereinigte Protokolle, Diagnosen und Metadaten einzelner Runs |
| `.runtime/attachments/` | Kontrollierte Anhangsdateien |
| `.runtime/workspaces/` | Vom Runtime verwaltete Projektarbeitsbereiche |

Codex-Sitzungen und -Konfiguration verbleiben in `$CODEX_HOME` und müssen getrennt von `.runtime/` gesichert werden.

Zu den Sicherheitsgrenzen gehören:

- Der Daemon lauscht ausschließlich auf `127.0.0.1`; jede API mit Ausnahme der Zustandsprüfung erfordert ein Bearer-Token.
- Die HTML-Vorschau deaktiviert standardmäßig Skripte, Navigation und Pop-ups und erlaubt nur kontrollierte relative Ressourcen aus demselben Arbeitsbereich.
- Sensibler Speicher erfordert eine zweite Bestätigung. Vishnu Creator speichert unbestätigte Vorschläge niemals automatisch und dauerhaft.
- Diagnosen und Run-Protokolle werden vor der Rückgabe oder dem Export bereinigt.
- Desktop-Pakete aktivieren ASAR-Integrität und Cookie-Verschlüsselung und deaktivieren RunAsNode, `NODE_OPTIONS` und den Node CLI Inspector.

Vollständige Anleitungen zu Sicherung, Wiederherstellung, Bereinigung und Zurücksetzen findest du im [Benutzerhandbuch und Leitfaden zur Fehlerbehebung](../vishnucreator-user-guide-and-troubleshooting.md).

## Entwicklung

### Häufige Befehle

| Befehl | Zweck |
| --- | --- |
| `pnpm web:dev` | Web starten und den lokalen Daemon bei Bedarf ausführen |
| `pnpm daemon:dev` | Nur den Daemon starten |
| `pnpm desktop:dev` | Abhängigkeiten bauen und Electron im Entwicklungsmodus starten |
| `pnpm test` | Unit- und Integrationstests des Arbeitsbereichs ausführen |
| `pnpm typecheck` | TypeScript-Prüfungen im gesamten Repository ausführen |
| `pnpm build` | Alle Workspaces bauen |
| `pnpm e2e` | Playwright-E2E-Tests für Web ausführen |
| `pnpm smoke:ci` | Runtime-Smoke-Test mit einem simulierten Codex ausführen |
| `pnpm perf:check` | Aufgezeichneten Leistungsreferenzwert prüfen |

Wähle vor einer Änderung Prüfungen passend zu ihren Auswirkungen, wie im [Beitragsleitfaden](../../CONTRIBUTING.md#what-reviewers-check) beschrieben. Änderungen an Dokumentation, Text und Stil benötigen nur passende Prüfungen; gemeinsames Verhalten und Runtime erfordern gezielte Modultests und Typprüfungen. Führe vollständige Tests oder Builds nur bei Bedarf aus und dokumentiere die tatsächlich durchgeführten Prüfungen im PR.

Änderungen an Desktop, Host Bridge, Runtime-Proxy oder gemeinsam genutzten Frontend-Arbeitsabläufen erfordern außerdem Web/Desktop-Konsistenztests, E2E-Tests der paketierten Anwendung und eine Überprüfung des Web-Build-Hashs. Das Bestehen der Web-Unit-Tests allein belegt nicht, dass Desktop veröffentlichungsbereit ist.

Der Smoke-Test mit echtem Codex ist standardmäßig deaktiviert. Aktiviere ihn ausdrücklich mit:

```bash
VISHNUCREATOR_RUN_REAL_CODEX_SMOKE=1 \
pnpm --filter @vishnucreator/daemon test -- test/smoke/real-codex-smoke.test.ts
```

## Dokumentation

- **Vishnu Creator nutzen:** [Schnellstart](#schnellstart) · [Benutzerhandbuch und Fehlerbehebung](../vishnucreator-user-guide-and-troubleshooting.md)
- **Entwickeln und erweitern:** [Beitragsleitfaden](../../CONTRIBUTING.md) · [Skill beitragen](../contributing/skills-contributing.md) · [Erstellungsvorlage beitragen](../contributing/templates-contributing.md) · [Runtime API v1](../runtime-api-for-ui-v1.md) · [Richtlinien für visuelle Komponenten](../visual-component-guidelines.md)
- **Warten und veröffentlichen:** [Design der Codex-nativen Runtime](../2026-07-03-codex-native-agent-runtime-design.md) · [Desktop-Release-Runbook](../operations/vishnucreator-desktop-release-runbook.md) · [Leitfaden für Windows-Desktop-Releases](../operations/vishnucreator-desktop-windows-release.md)

## Übersetzungskonvention

Die Datei `README.md` im Stammverzeichnis ist das maßgebliche englische Dokument. Gepflegte Übersetzungen befinden sich unter `docs/<locale>/README.md`. Füge eine Sprache erst dann zur Sprachauswahl hinzu, wenn das vollständige Dokument übersetzt und mit der englischen Struktur synchronisiert wurde.

## Community

<p>GitHub-Nutzer aus <strong>mindestens 105 Ländern und Regionen</strong> haben Vishnu Creator mit einem Star ausgezeichnet.</p>

<img src="../images/star-coverage-map.svg" alt="Weltkarte mit Ländern und Regionen, aus denen GitHub-Nutzer Vishnu Creator einen Star gegeben haben" width="760" />

### Das Team

Jedes Mitglied verantwortet in seinem Bereich Standards, Prüfung und Zusammenführung von Beiträgen sowie Unterstützung der Community.

<table border="1" cellpadding="12">
  <tr>
    <td align="center" valign="middle" width="160" height="160"><img src="../images/contributors/wulien.svg" width="64" height="64" alt="wulien avatar" /><br /><a href="https://github.com/wulien">wulien</a><br />Code und Fehlerbehebungen</td>
    <td align="center" valign="middle" width="160" height="160"><img src="../images/contributors/dle-kb.svg" width="64" height="64" alt="DLe-kb avatar" /><br /><a href="https://github.com/DLe-kb">DLe-kb</a><br />Erstellungsvorlagen</td>
    <td align="center" valign="middle" width="160" height="160"><img src="../images/contributors/xiaheyuan.svg" width="64" height="64" alt="xiaheyuan avatar" /><br /><a href="https://github.com/xiaheyuan">xiaheyuan</a><br />Design und Assets</td>
    <td align="center" valign="middle" width="160" height="160"><img src="../images/contributors/vishnuai.svg" width="64" height="64" alt="vishnuai avatar" /><br /><a href="https://github.com/vishnuai">vishnuai</a><br />Skills und Dokumentation</td>
    <td align="center" valign="middle" width="160" height="160"><img src="../images/contributors/hbxugang.svg" width="64" height="64" alt="hbxugang avatar" /><br /><a href="https://github.com/hbxugang">hbxugang</a><br />Bereitstellung für Unternehmen</td>
  </tr>
</table>

### Mitwirkende

Vielen Dank an alle, die mit Code, Dokumentation, Feedback, Fehlerberichten, Skills, Designs und Ideen beigetragen haben.

<div>
  <a href="https://github.com/maranello-o"><img src="../images/contributors/maranello-o.svg" width="48" height="48" alt="maranello-o" /></a>
  <a href="https://github.com/wulien"><img src="../images/contributors/wulien.svg" width="48" height="48" alt="wulien" /></a>
  <a href="https://github.com/puji4810"><img src="../images/contributors/puji4810.svg" width="48" height="48" alt="puji4810" /></a>
  <a href="https://github.com/vishnuai"><img src="../images/contributors/vishnuai.svg" width="48" height="48" alt="vishnuai" /></a>
  <a href="https://github.com/PairZhu"><img src="../images/contributors/pairzhu.svg" width="48" height="48" alt="PairZhu" /></a>
  <a href="https://github.com/Mijaelx"><img src="../images/contributors/mijaelx.svg" width="48" height="48" alt="Mijaelx" /></a>
  <a href="https://github.com/OutisLi"><img src="../images/contributors/outisli.svg" width="48" height="48" alt="OutisLi" /></a>
  <a href="https://github.com/yeager"><img src="../images/contributors/yeager.svg" width="48" height="48" alt="yeager" /></a>
  <a href="https://github.com/catwithtudou"><img src="../images/contributors/catwithtudou.svg" width="48" height="48" alt="catwithtudou" /></a>
  <a href="https://github.com/newdee"><img src="../images/contributors/newdee.svg" width="48" height="48" alt="newdee" /></a>
  <a href="https://github.com/scwf"><img src="../images/contributors/scwf.svg" width="48" height="48" alt="scwf" /></a>
  <a href="https://github.com/xiaheyuan"><img src="../images/contributors/xiaheyuan.svg" width="48" height="48" alt="xiaheyuan" /></a>
  <a href="https://github.com/hbxugang"><img src="../images/contributors/hbxugang.svg" width="48" height="48" alt="hbxugang" /></a>
  <a href="https://github.com/kapil971390"><img src="../images/contributors/kapil971390.svg" width="48" height="48" alt="kapil971390" /></a>
  <a href="https://github.com/octo-patch"><img src="../images/contributors/octo-patch.svg" width="48" height="48" alt="octo-patch" /></a>
  <a href="https://github.com/yuanjinghh"><img src="../images/contributors/yuanjinghh.svg" width="48" height="48" alt="yuanjinghh" /></a>
  <a href="https://github.com/DLe-kb"><img src="../images/contributors/dle-kb.svg" width="48" height="48" alt="DLe-kb" /></a>
  <a href="https://github.com/liupig"><img src="../images/contributors/liupig.svg" width="48" height="48" alt="liupig" /></a>
  <a href="https://github.com/alextavares" title="alextavares"><img src="../images/contributors/alextavares.svg" width="48" height="48" alt="alextavares" /></a>
  <a href="https://github.com/vishnuai/Vishnu Creator/commit/a89cff0ac5d91540f03e361af50b286ee57691ae" title="卡皮巴拉"><img src="../images/contributors/kapibala.svg" width="48" height="48" alt="卡皮巴拉" /></a>
  <a href="https://github.com/mifan100g" title="mifan100g (米饭二两)"><img src="../images/contributors/mifan100g.svg" width="48" height="48" alt="mifan100g (米饭二两)" /></a>
  <a href="https://github.com/askalf"><img src="../images/contributors/askalf.svg" width="48" height="48" alt="askalf" /></a>
  <a href="https://github.com/Yi-111-a"><img src="../images/contributors/yi-111-a.svg" width="48" height="48" alt="Yi-111-a" /></a>
</div>

### Mitwirken

Du kannst auf viele Arten zu Vishnu Creator beitragen, nicht nur mit Code:

| Art | Beitrag | Vorbereitung | Wo einreichen |
| --- | --- | --- | --- |
| Code | Fehlerbehebung, Kreativabläufe, gemeinsame Funktionen | Gezielte Änderung, Demo oder Reproduktion, Tests | [Issue][contribute-issue] → [PR][contribute-pr]; `apps/web/` oder `apps/daemon/` |
| Skills | Wiederverwendbare Agent-Workflows | `SKILL.md`, Voraussetzungen und Beispiele | [Issue][contribute-issue] → [PR][contribute-pr] in `skills/` |
| Kreativvorlagen | Wiederverwendbare Bild-, Video- oder Covervorlagen | `template.json`, Cover- und Beispielmedien, Prompts, Einstellungen, Quellenangabe und Nutzungsrechte | [PR][contribute-pr] in [`template/`](../../template/); neue Formate im [Issue][contribute-issue] besprechen |
| Illustration und Design | Eigene Illustrationen, Icons oder UI | Vorschau, bearbeitbare Quelldateien und Lizenz | [Issue][contribute-issue] → [PR][contribute-pr] am vereinbarten Asset-Ort |
| Drittanbieter-Integrationen | KI- oder Mediendienste | Anwendungsfall, Konfiguration, Fehler, Schutz der Zugangsdaten und Tests | [Issue][contribute-issue] → [PR][contribute-pr] in Web- / Daemon-Modulen |

Lege jede Vorlage mit ihren Medien unter `template/<module>/<id>/<version>/template.json` ab. Die aktuellen Module sind `image-generation`, `video-generation` und `cover-generator`. Titel und Beschreibung müssen auf Chinesisch und Englisch vorliegen. Führe vor dem PR `pnpm templates:validate` aus.

So trägst du bei:

1. Beschreibe Problem, Anwendungsfall und erwartetes Verhalten in den [Issues](https://github.com/vishnuai/Vishnu Creator/issues).
2. Erstelle vom neuesten Entwicklungsbranch einen fokussierten Feature- oder Fix-Branch.
3. Folge der bestehenden Architektur: Implementiere allgemeine Produktfunktionen einmal in Web und Daemon und isoliere native Unterschiede hinter ausdrücklichen Capabilities.
4. Ergänze angemessene Unit-, Integrations- oder E2E-Abdeckung für Verhaltensänderungen und führe im Pull Request sowohl abgeschlossene als auch ausgelassene Prüfungen auf.
5. Committe niemals `.runtime/`, lokale Zugangsdaten, Codex-Sitzungen, Build-Caches oder andere Benutzerdaten.

[contribute-issue]: https://github.com/vishnuai/Vishnu Creator/issues
[contribute-pr]: https://github.com/vishnuai/Vishnu Creator/pulls

## Star-Verlauf

Vishnu Creator hieß früher VishnuAI. Dieses Diagramm zeigt den vollständigen Verlauf des Repositorys vor und nach der Umbenennung.

[![Vishnu Creator Star-Verlauf](https://api.star-history.com/svg?repos=vishnuai/Vishnu Creator&type=date)](https://www.star-history.com/?type=date&repos=vishnuai%2FVishnu Creator)

## Verwandte Projekte

| Projekt | Aufgabe |
| --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | Agent-Ausführungs-Engine für Modellzugriff, Schlussfolgerungen, Werkzeugaufrufe, Sitzungen, Skills und MCP-Integration. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Prüft unterstützte öffentliche Medienlinks, listet verfügbare Formate auf und lädt Video oder Audio für Kreativabläufe herunter. |
| [FFmpeg](https://ffmpeg.org/) | FFmpeg und ffprobe übernehmen Medienkonvertierung, Komposition, Frame-Extraktion und Ausgabeprüfung. |
| [Whisper](https://github.com/openai/whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) und [WhisperKit](https://github.com/argmaxinc/WhisperKit) | Cloud- und plattformspezifische lokale Sprachtranskriptionsoptionen, ausgewählt nach den verfügbaren Runtime-Funktionen. |
| [React](https://react.dev/) | Grundlage der gemeinsamen Benutzeroberfläche für Web und Desktop. |
| [Fastify](https://fastify.dev/) | HTTP- und API-Grundlage des lokalen Runtime. |
| [Electron](https://www.electronjs.org/) | Desktop-Host für native Systemfunktionen, Anwendungslebenszyklus und Paketierung. |
| [SQLite](https://www.sqlite.org/) | Lokale Speicherung für Projekte, Unterhaltungen, Runs, Zeitpläne, Speicher und weitere Arbeitsbereichsdaten. |
| [Model Context Protocol](https://modelcontextprotocol.io/) | Offenes Protokoll zum Verbinden externer Werkzeuge und Dienste mit dem Agent-Arbeitsbereich. |

---

<div align="center">

**Vishnu Creator · Lokal erstellen, kontinuierlich arbeiten.**

</div>
