<?php

namespace App\Services;

use App\Models\PlanFeatures;
use App\Models\Tenant;

class PlanService
{
    public static function resolveFeatures(Tenant $tenant): array
    {
        if ($tenant->plan === 'custom' && !empty($tenant->custom_features)) {
            return $tenant->custom_features;
        }

        $pf = PlanFeatures::forPlan($tenant->plan);
        return $pf?->features ?? PlanFeatures::defaults();
    }

    public static function isEnabled(Tenant $tenant, string $feature): bool
    {
        $value = self::resolveFeatures($tenant)[$feature] ?? false;
        if (is_array($value)) return (bool) ($value['enabled'] ?? false);
        return (bool) $value;
    }

    public static function getLimit(Tenant $tenant, string $feature, string $key): int
    {
        $features = self::resolveFeatures($tenant);
        return (int) data_get($features, "{$feature}.{$key}", 0);
    }

    public static function withinLimit(Tenant $tenant, string $feature, string $key, int $current): bool
    {
        $limit = self::getLimit($tenant, $feature, $key);
        return $limit === -1 || $current < $limit;
    }

    public static function messagesPerMonth(Tenant $tenant): int
    {
        return (int) (self::resolveFeatures($tenant)['messages_per_month'] ?? 500);
    }

    public static function requiredPlanFor(string $feature): string
    {
        $proFeatures    = ['proposals', 'media', 'events', 'team', 'external_signals', 'intelligence'];
        $eliteFeatures  = ['attack_responses', 'livestream'];
        if (in_array($feature, $eliteFeatures)) return 'elite';
        if (in_array($feature, $proFeatures))   return 'pro';
        return 'starter';
    }
}
