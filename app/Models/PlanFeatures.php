<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlanFeatures extends Model
{
    protected $connection = 'central';
    protected $table      = 'plan_features';

    protected $fillable = ['plan', 'label', 'price', 'features', 'is_active'];

    protected $casts = [
        'features'  => 'array',
        'price'     => 'float',
        'is_active' => 'boolean',
    ];

    public static function forPlan(string $plan): ?self
    {
        return static::where('plan', $plan)->first();
    }

    public static function defaults(): array
    {
        return [
            'chatbot'           => true,
            'candidate_profile' => true,
            'faqs'              => true,
            'chat_sessions'     => true,
            'analytics'         => true,
            'proposals'         => false,
            'media'             => false,
            'events'            => false,
            'team'              => false,
            'attack_responses'  => false,
            'livestream'        => false,
            'knowledge'         => ['enabled' => true, 'max_documents' => 5],
            'external_signals'  => ['enabled' => false, 'advanced' => false],
            'intelligence'      => ['enabled' => false, 'advanced' => false],
            'messages_per_month' => 500,
        ];
    }
}
