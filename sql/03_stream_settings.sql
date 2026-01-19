-- Stream Settings Migration
-- Adds keyframe interval (GOP) and bitrate settings to channels

ALTER TABLE channels ADD COLUMN IF NOT EXISTS keyframe_interval INTEGER DEFAULT 2;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS video_bitrate INTEGER DEFAULT 0; -- 0 = copy (no transcode)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS audio_bitrate INTEGER DEFAULT 128;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS output_resolution TEXT DEFAULT ''; -- empty = source resolution

-- Comments
COMMENT ON COLUMN channels.keyframe_interval IS 'GOP size in seconds (1-10), used when transcoding';
COMMENT ON COLUMN channels.video_bitrate IS 'Video bitrate in kbps (0 = copy without re-encoding)';
COMMENT ON COLUMN channels.audio_bitrate IS 'Audio bitrate in kbps (64-320)';
COMMENT ON COLUMN channels.output_resolution IS 'Output resolution (empty = source, or 1920x1080, 1280x720, etc)';
