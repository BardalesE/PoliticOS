<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuestionCluster extends Model
{
    protected $fillable = [
        'cluster_label','representative_question','topic','message_count',
        'sample_questions','sample_message_ids','avg_sentiment','analyzed_date',
    ];

    protected $casts = [
        'sample_questions' => 'array',
        'sample_message_ids' => 'array',
        'analyzed_date' => 'date',
        'avg_sentiment' => 'float',
    ];
}
