<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::firstOrCreate(
            ['email' => 'admin@politicos.pe'],
            [
                'name'     => 'Administrador',
                'password' => Hash::make('Admin2024!'),
                'role'     => 'admin',
            ]
        );
    }
}
