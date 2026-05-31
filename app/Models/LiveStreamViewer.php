<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LiveStreamViewer extends Model
{
    protected $fillable = [
        'live_stream_id', 'viewer_token', 'ip_address',
        'user_agent', 'device_type', 'watch_start', 'last_ping', 'total_seconds',
    ];

    protected $casts = [
        'watch_start' => 'datetime',
        'last_ping'   => 'datetime',
    ];

    public function stream(): BelongsTo
    {
        return $this->belongsTo(LiveStream::class, 'live_stream_id');
    }

    public static function detectDevice(string $ua): string
    {
        $ua = strtolower($ua);
        if (str_contains($ua, 'mobile') || str_contains($ua, 'android') || str_contains($ua, 'iphone')) {
            return 'mobile';
        }
        if (str_contains($ua, 'tablet') || str_contains($ua, 'ipad')) {
            return 'tablet';
        }
        return 'desktop';
    }
}
