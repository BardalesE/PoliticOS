<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiSetting extends Model
{
    // Mapeo modo -> archivo de prompt por defecto. Fuente única de verdad
    // para el acoplamiento mode -> system_prompt (ver defaultPromptForMode()
    // y AiSettingController::update()).
    public const DEFAULT_PROMPT_FILES = [
        'campaign' => 'politicos_v2_prompt.txt',
        'pepa'     => 'pepa_prompt.txt',
    ];

    // Campos que puede editar el admin de un candidato (apariencia del botón
    // del chat). Todo lo demás (proveedor, modelo, API key, prompt, modo) es
    // configuración de PLATAFORMA: solo el superadmin la toca, por tenant y con
    // el tenant explícito en la URL (ver SuperAdminController::updateTenantAiSettings).
    public const TENANT_EDITABLE = [
        'chat_subtitle', 'chat_btn_text', 'chat_btn_image_url',
        'chat_btn_shape', 'chat_btn_color', 'chat_btn_size', 'chat_btn_position',
    ];

    // Groq retiró estos modelos (docs: console.groq.com/docs/deprecations). Si un
    // tenant, el .env o un script los sigue apuntando, Groq responde 404 y cada
    // mensaje cae en silencio al proveedor de respaldo (Claude, de pago). Se
    // reemplazan en tiempo de llamada por el equivalente vigente que recomienda Groq.
    public const RETIRED_GROQ_MODELS = [
        'llama-3.3-70b-versatile' => 'openai/gpt-oss-120b',
        'llama-3.1-8b-instant'    => 'openai/gpt-oss-20b',
        'mixtral-8x7b-32768'      => 'openai/gpt-oss-20b',
        'gemma2-9b-it'            => 'openai/gpt-oss-20b',
    ];

    public const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

    /** Modelo Groq realmente usable: sustituye los retirados; vacío → el default de config. */
    public static function effectiveGroqModel(?string $configured = null): string
    {
        $model = trim((string) ($configured ?: config('services.ai.groq_model', self::DEFAULT_GROQ_MODEL)));

        return self::RETIRED_GROQ_MODELS[$model] ?? ($model !== '' ? $model : self::DEFAULT_GROQ_MODEL);
    }

    // Tope de mensajes por conversación (chat público). Lo fija el superadmin por candidato.
    public const MESSAGE_LIMIT_MIN     = 10;
    public const MESSAGE_LIMIT_MAX     = 50;
    public const MESSAGE_LIMIT_DEFAULT = 20;

    protected $fillable = [
        'provider', 'api_key', 'model', 'max_tokens', 'temperature',
        'fallback_provider', 'system_prompt', 'system_prompt_customizado', 'mode',
        'chat_subtitle', 'chat_btn_text', 'chat_btn_image_url',
        'chat_btn_shape', 'chat_btn_color', 'chat_btn_size', 'chat_btn_position',
        'attack_spike_threshold', 'max_messages_per_session', 'support_poll_enabled',
    ];

    // api_key nunca sale de la BD en texto plano — Laravel cifra/descifra
    // transparentemente con APP_KEY. No la expongas en respuestas JSON: usa
    // $setting->api_key !== null en su lugar (ver AiSettingController::show()).
    protected $hidden = ['api_key'];

    protected $casts = [
        'max_tokens'                => 'integer',
        'temperature'               => 'float',
        'api_key'                   => 'encrypted',
        'attack_spike_threshold'    => 'integer',
        'max_messages_per_session'  => 'integer',
        'support_poll_enabled'      => 'boolean',
        'system_prompt_customizado' => 'boolean',
    ];

    public static function current(): self
    {
        return static::firstOrCreate([], [
            'provider'         => config('services.ai.provider', 'groq'),
            'model'            => self::effectiveGroqModel(),
            'max_tokens'       => 1200,
            'temperature'      => 0.4,
            'fallback_provider' => 'claude',
            'system_prompt'     => '',
            'system_prompt_customizado' => false,
            'chat_subtitle'     => 'IA · 24/7',
            'chat_btn_text'     => null,
            'chat_btn_image_url'=> null,
            'chat_btn_shape'    => 'pill',
            'chat_btn_color'    => null,
            'chat_btn_size'     => 'md',
            'chat_btn_position' => 'bottom-right',
            'attack_spike_threshold' => 10,
        ]);
    }

    /** Mensajes permitidos por conversación, siempre dentro de 10–50. */
    public function sessionMessageLimit(): int
    {
        $value = (int) ($this->max_messages_per_session ?: self::MESSAGE_LIMIT_DEFAULT);

        return max(self::MESSAGE_LIMIT_MIN, min(self::MESSAGE_LIMIT_MAX, $value));
    }

    // Prompt de fábrica para un modo dado (DEFAULT_PROMPT_FILES). Usado al
    // resincronizar system_prompt cuando el admin cambia `mode` sin haber
    // personalizado el prompt (system_prompt_customizado === false).
    public static function defaultPromptForMode(string $mode): string
    {
        $file = self::DEFAULT_PROMPT_FILES[$mode] ?? self::DEFAULT_PROMPT_FILES['campaign'];
        $path = base_path("resources/prompts/{$file}");

        return file_exists($path) ? (file_get_contents($path) ?: '') : '';
    }

    /**
     * Aplica una edición validada de la configuración de IA. Única fuente de la
     * regla de acoplamiento mode -> system_prompt, compartida por el admin del
     * tenant (solo campos TENANT_EDITABLE) y el superadmin (todos los campos):
     * - Si cambia `mode` y el prompt sigue siendo el de fábrica (no
     *   personalizado), resincroniza system_prompt con el default del modo
     *   nuevo. Tiene prioridad sobre una edición manual simultánea.
     * - Si no cambia el modo pero el prompt sí (edición manual directa), marca
     *   system_prompt_customizado = true para que un futuro cambio de modo ya no
     *   lo pise.
     */
    public function applyAdminUpdate(array $data): self
    {
        $modeChanged   = array_key_exists('mode', $data) && $data['mode'] !== $this->mode;
        $promptChanged = array_key_exists('system_prompt', $data) && $data['system_prompt'] !== $this->system_prompt;

        if ($modeChanged && !$this->system_prompt_customizado) {
            $data['system_prompt'] = self::defaultPromptForMode($data['mode']);
        } elseif ($promptChanged) {
            $data['system_prompt_customizado'] = true;
        }

        $this->update($data);

        return $this;
    }
}
