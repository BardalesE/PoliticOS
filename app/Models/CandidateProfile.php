<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CandidateProfile extends Model
{
    protected $fillable = [
        'preset_name', 'is_active',
        'name', 'title', 'location', 'party', 'list_number',
        'bio', 'tagline', 'election_date',
        'photo_url', 'logo_url', 'hero_photo_url', 'hero_video_url',
        'color_primary', 'color_dark', 'color_accent',
        'tiktok_url', 'facebook_url', 'instagram_url', 'whatsapp_number',
        // v2 campos de personalidad para el system prompt dinámico
        'personality_traits', 'biography_long', 'signature_phrases',
        'forbidden_topics', 'priority_topics', 'target_segments',
        'campaign_slogan', 'attack_response_style',
    ];

    protected $casts = [
        'is_active'          => 'boolean',
        'personality_traits' => 'array',
        'signature_phrases'  => 'array',
        'forbidden_topics'   => 'array',
        'priority_topics'    => 'array',
        'target_segments'    => 'array',
    ];

    public static function current(): ?self
    {
        return static::where('is_active', true)->first()
            ?? static::first();
    }
}
