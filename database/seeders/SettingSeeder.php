<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'show_hero'       => '1',
            'show_assistant'  => '1',
            'show_proposals'  => '1',
            'show_multimedia' => '1',
            'show_events'     => '1',
            'show_districts'  => '1',
            'show_team'       => '1',
            'show_connection' => '1',
        ];

        foreach ($defaults as $key => $value) {
            Setting::firstOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
