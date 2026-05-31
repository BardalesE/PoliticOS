<?php

namespace Database\Seeders;

use App\Models\Tenant;
use Illuminate\Database\Seeder;

class TenantSeeder extends Seeder
{
    public function run(): void
    {
        // Primer tenant: James Cueva (apunta a la DB actual)
        Tenant::firstOrCreate(
            ['slug' => env('APP_TENANT_SLUG', 'james')],
            [
                'name'        => 'Rigo',
                'db_name'     => env('DB_DATABASE', 'bdpolitic'),
                'db_host'     => env('DB_HOST', '127.0.0.1'),
                'db_port'     => env('DB_PORT', 3306),
                'db_user'     => env('DB_USERNAME', 'root'),
                'db_password' => env('DB_PASSWORD', ''),
                'plan'        => 'pro',
                'is_active'   => true,
            ]
        );
    }
}
