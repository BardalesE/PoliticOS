<?php

/*
 | Verificación de contactos (OTP) de los leads que se registran.
 |
 | Al registrarse, la persona recibe un código de 6 dígitos por correo y por
 | WhatsApp; solo si lo confirma se acepta el registro (y se desbloquea el bono
 | de mensajes). Un canal solo se exige si está realmente configurado en el
 | servidor: así, mientras Meta no apruebe la plantilla de WhatsApp, el registro
 | sigue funcionando con el correo verificado y no se bloquea a nadie.
 */
return [
    // Interruptor general. false = registro sin verificar (comportamiento anterior).
    'enabled' => (bool) env('CONTACT_VERIFICATION_ENABLED', true),

    'code_length'     => 6,
    'ttl_minutes'     => (int) env('CONTACT_VERIFICATION_TTL', 10),   // vigencia del código
    'max_attempts'    => (int) env('CONTACT_VERIFICATION_MAX_ATTEMPTS', 5),
    'resend_cooldown' => (int) env('CONTACT_VERIFICATION_RESEND_SECONDS', 60),
    // Tras verificar, tiempo que se acepta el contacto para completar el registro.
    'verified_window_minutes' => (int) env('CONTACT_VERIFICATION_WINDOW', 30),

    // Topes anti-abuso (cada envío de WhatsApp cuesta dinero: evitan el "OTP pumping").
    'limits' => [
        'per_contact' => ['max' => 3,  'minutes' => 10],
        'per_visitor' => ['max' => 6,  'minutes' => 60],
        'per_ip'      => ['max' => 10, 'minutes' => 60],
    ],

    'whatsapp' => [
        // WhatsApp Cloud API (Meta). Requiere plantilla de categoría "Authentication" aprobada.
        'token'           => env('WHATSAPP_TOKEN'),
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'template'        => env('WHATSAPP_OTP_TEMPLATE'),
        'language'        => env('WHATSAPP_OTP_LANGUAGE', 'es'),
        'api_version'     => env('WHATSAPP_API_VERSION', 'v21.0'),
    ],
];
