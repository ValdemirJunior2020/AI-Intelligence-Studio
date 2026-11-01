param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$WavFile,[string]$Voice='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$tts=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 if ($Voice) { $tts.SelectVoice($Voice) }
 $text=[System.IO.File]::ReadAllText($TextFile,[System.Text.Encoding]::UTF8)
 if ([string]::IsNullOrWhiteSpace($text)) { throw 'Narration text is empty' }
 $tts.SetOutputToWaveFile($WavFile)
 $tts.Speak($text)
 $tts.SetOutputToNull()
} finally { $tts.Dispose() }
