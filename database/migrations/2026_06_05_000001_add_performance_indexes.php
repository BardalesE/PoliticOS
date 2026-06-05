<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // chat_messages — consultas frecuentes en IntelligenceService
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->index(['role', 'created_at'],            'idx_cm_role_created');
            $table->index(['attack_detected', 'created_at'], 'idx_cm_attack_created');
            $table->index(['topic', 'created_at'],           'idx_cm_topic_created');
            $table->index(['sentiment', 'created_at'],       'idx_cm_sentiment_created');
        });

        // chat_sessions — geo y tiempo real
        Schema::table('chat_sessions', function (Blueprint $table) {
            $table->index(['geo_region', 'created_at'],      'idx_cs_geo_region');
            $table->index('updated_at',                      'idx_cs_updated_at');
            $table->index('inferred_segment',                'idx_cs_segment');
        });

        // citizen_profiles — lookups de referral y visitor
        Schema::table('citizen_profiles', function (Blueprint $table) {
            $table->index('referral_code',  'idx_cp_referral_code');
            $table->index('visitor_uuid',   'idx_cp_visitor_uuid');
        });

        // live_stream_viewers — conteo de viewers en vivo cada 40s
        Schema::table('live_stream_viewers', function (Blueprint $table) {
            $table->index(['live_stream_id', 'last_ping'], 'idx_lsv_stream_ping');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex('idx_cm_role_created');
            $table->dropIndex('idx_cm_attack_created');
            $table->dropIndex('idx_cm_topic_created');
            $table->dropIndex('idx_cm_sentiment_created');
        });

        Schema::table('chat_sessions', function (Blueprint $table) {
            $table->dropIndex('idx_cs_geo_region');
            $table->dropIndex('idx_cs_updated_at');
            $table->dropIndex('idx_cs_segment');
        });

        Schema::table('citizen_profiles', function (Blueprint $table) {
            $table->dropIndex('idx_cp_referral_code');
            $table->dropIndex('idx_cp_visitor_uuid');
        });

        Schema::table('live_stream_viewers', function (Blueprint $table) {
            $table->dropIndex('idx_lsv_stream_ping');
        });
    }
};
