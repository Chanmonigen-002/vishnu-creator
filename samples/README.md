# VoxCPM2 Voice Reading Samples

This directory provides official clean voice reading samples for zero-shot voice cloning and LoRA training:

1. **oxcpm2_reference_speaker.wav**
   - Sample Rate: 48,000 Hz, 16-bit PCM Mono
   - Duration: 12.8 seconds
   - Purpose: Reference speaker audio for zero-shot and Ultimate voice cloning.

2. **oxcpm2_training_sample.wav**
   - Sample Rate: 44,100 Hz (resampled to 16,000 Hz by prepare_dataset.py)
   - Duration: 8.16 seconds
   - Purpose: Baseline voice reading sample for fine-tuning dataset preparation and LoRA training manifests.

3. **sample_transcripts.txt**
   - Standard ilename|transcript format compatible with prepare_dataset.py.
