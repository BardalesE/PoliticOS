<?php

namespace Database\Seeders;

use App\Models\PlanFeatures;
use Illuminate\Database\Seeder;

class PlanFeaturesSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'plan'  => 'starter',
                'label' => 'Starter',
                'price' => 0.00,
                'features' => [
                    'chatbot'            => true,
                    'candidate_profile'  => true,
                    'faqs'               => true,
                    'chat_sessions'      => true,
                    'analytics'          => true,
                    'proposals'          => false,
                    'media'              => false,
                    'events'             => false,
                    'team'               => false,
                    'attack_responses'   => false,
                    'livestream'         => false,
                    'surveys'            => false,
                    'knowledge'          => ['enabled' => true, 'max_documents' => 5],
                    'external_signals'   => ['enabled' => false, 'advanced' => false],
                    'intelligence'       => ['enabled' => false, 'advanced' => false],
                    'messages_per_month' => 500,
                ],
            ],
            [
                'plan'  => 'pro',
                'label' => 'Pro',
                'price' => 49.00,
                'features' => [
                    'chatbot'            => true,
                    'candidate_profile'  => true,
                    'faqs'               => true,
                    'chat_sessions'      => true,
                    'analytics'          => true,
                    'proposals'          => true,
                    'media'              => true,
                    'events'             => true,
                    'team'               => true,
                    'attack_responses'   => false,
                    'livestream'         => false,
                    'surveys'            => true,
                    'knowledge'          => ['enabled' => true, 'max_documents' => 20],
                    'external_signals'   => ['enabled' => true, 'advanced' => false],
                    'intelligence'       => ['enabled' => true, 'advanced' => false],
                    'messages_per_month' => 2000,
                ],
            ],
            [
                'plan'  => 'elite',
                'label' => 'Elite',
                'price' => 149.00,
                'features' => [
                    'chatbot'            => true,
                    'candidate_profile'  => true,
                    'faqs'               => true,
                    'chat_sessions'      => true,
                    'analytics'          => true,
                    'proposals'          => true,
                    'media'              => true,
                    'events'             => true,
                    'team'               => true,
                    'attack_responses'   => true,
                    'livestream'         => true,
                    'surveys'            => true,
                    'knowledge'          => ['enabled' => true, 'max_documents' => -1],
                    'external_signals'   => ['enabled' => true, 'advanced' => true],
                    'intelligence'       => ['enabled' => true, 'advanced' => true],
                    'messages_per_month' => -1,
                ],
            ],
        ];

        foreach ($plans as $data) {
            PlanFeatures::updateOrCreate(
                ['plan' => $data['plan']],
                array_merge($data, ['is_active' => true])
            );
        }
    }
}
