# Compliance Legal — PoliticOS v2

Sistema operado en Perú. Aplica:

1. **Ley 29733** — Protección de Datos Personales (APDP / Ministerio de Justicia)
2. **Ley 28278** — Radio y Televisión + reglas de propaganda electoral del **JNE** (Jurado Nacional de Elecciones)
3. **Ley 27269** — Firmas y certificados digitales (irrelevante aquí, pero ojo si firmas adhesiones)
4. **Decreto Legislativo 1182** — Geolocalización con orden judicial (no aplicable a IP de visitantes web; no recolectamos eso)

---

## 1. Ley 29733 — Datos Personales

### Qué dato es "personal"

> Cualquier información que identifique a una persona natural o la haga identificable.

**Sí son datos personales:**
- DNI, RUC, teléfono, dirección postal
- Nombre completo + distrito específico
- Foto de la cara
- Datos sensibles (salud, religión, ideología política, orientación sexual)

**Lo que recolectamos NOSOTROS (zona gris):**
- IP del visitante → es personal si la podemos cruzar con otros datos (sí). **Pseudonimizamos: cookie UUID anónimo en lugar de IP en analytics**.
- Rango de edad declarado: NO es identificable por sí solo.
- Distrito declarado: NO identifica si no se cruza con DNI.
- Intención de voto: **DATO SENSIBLE** (ideología política). Requiere consentimiento explícito.

### Qué hace PoliticOS v2 para cumplir

| Requisito Ley 29733 | Implementación |
|---|---|
| Consentimiento previo, libre, informado | `ConsentModal` aparece antes del primer mensaje del visitante. Se almacena en `chat_sessions.consent_data_capture` y timestamp en `consent_at`. |
| Finalidad explícita | El modal explica para qué se usan los datos (mejorar respuestas + análisis agregado). |
| Datos mínimos necesarios | NUNCA pedimos DNI, teléfono ni dirección. Solo rango de edad, profesión, distrito (no dirección), intención. |
| Derecho ARCO (acceso/rectificación/cancelación/oposición) | Email público `privacidad@politicos.pe`. Cuando borren visitor_uuid se elimina cascada de `citizen_data`. |
| Registro de la base de datos en APDP | Tienes 90 días desde el inicio de operación para registrar el banco de datos. Hazlo en https://www.minjus.gob.pe/wp-content/uploads/2018/11/REGISTRO-NACIONAL-DE-PROTECCION-DE-DATOS-PERSONALES.pdf |
| Encargado del tratamiento | Designar a alguien en el equipo. Aparece en la política de privacidad. |
| Medidas de seguridad | TLS obligatorio en producción, bcrypt en passwords, JWT para admin, rate-limit en /chat. |
| Transferencia internacional | Si usas Groq/OpenAI/Anthropic → mencionar que los modelos AI procesan en USA. Cobertura: "Encargado del tratamiento internacional" en la política. |

### Texto de consentimiento (el que está en `ConsentModal.tsx`)

> "Estás por hablar con un asistente virtual basado en inteligencia artificial, entrenado con información pública del candidato. **No es el candidato en persona.**
>
> Para mejorar tus respuestas, este chat puede almacenar tus mensajes y datos opcionales que tú elijas compartir (edad, distrito, preferencias). **No recopilamos DNI, teléfono ni datos identificables.**
>
> Operado conforme a la Ley 29733 de Protección de Datos Personales. Puedes solicitar borrado en privacidad@politicos.pe."

**Recomendado:** Tener visible en el footer del sitio una **Política de Privacidad** completa (página /privacidad) y un email funcional para el ejercicio de derechos.

### Plantilla de Política de Privacidad

(Pega esto en `/privacidad` y adapta nombres)

```
POLÍTICA DE PRIVACIDAD - PoliticOS

1. RESPONSABLE
[Nombre legal] domiciliado en [Dirección], Perú, opera el sitio politicos.pe.

2. DATOS QUE RECOLECTAMOS
- Visitor UUID (cookie anónima, 1 año TTL)
- Mensajes del chat (contenido)
- Datos voluntariamente declarados: rango de edad, distrito/región,
  profesión, preocupación principal, intención de voto. SOLO si dio
  consentimiento explícito.
- IP, navegador, dispositivo: para seguridad y métricas agregadas.

3. NO RECOLECTAMOS
- DNI, RUC, número de teléfono, dirección exacta, fotos faciales.

4. FINALIDADES
- Mejorar las respuestas del asistente virtual.
- Análisis agregado de tendencias ciudadanas.
- Detección de amenazas y abusos.

5. CONSERVACIÓN
- Mensajes de chat: 365 días.
- Datos declarados: hasta que el titular solicite el borrado.

6. ENCARGADOS DEL TRATAMIENTO INTERNACIONAL
Usamos proveedores de inteligencia artificial (Anthropic, OpenAI, Groq)
que procesan los mensajes en sus servidores. Esos proveedores cuentan
con sus propias políticas y certificaciones.

7. EJERCICIO DE DERECHOS ARCO
Acceso, Rectificación, Cancelación, Oposición:
Email: privacidad@politicos.pe
Plazo de respuesta: 20 días hábiles según ley.

8. RECLAMOS
Autoridad Nacional de Protección de Datos Personales:
https://www.minjus.gob.pe
```

---

## 2. JNE — Propaganda Electoral

### Reglas que el sistema RESPETA por diseño

1. **No buying votes:** Está en las "líneas innegociables" del system prompt (regla #6). La IA jamás promete dinero, regalos o beneficios materiales a cambio del voto.
2. **No suplantación:** Divulgación obligatoria explícita ("soy el asistente virtual, no el candidato"). Está reforzado tanto en el modal como en system prompt como en el badge persistente.
3. **No ataques a rivales:** System prompt regla #3 prohíbe insultar a rivales por nombre.
4. **Veda electoral:** Si la fecha es 24h antes de la elección, recomendamos cerrar el chat con un banner "veda electoral". *(NO implementado en este patch — requiere agregar middleware temporal antes del 7 de junio.)*

### Lo que NO debes hacer (queda fuera del producto)

- No envíes WhatsApp masivos no solicitados (Ley 29733 + Indecopi).
- No compres listas con DNIs ni propagandas robocall.
- No publiques resultados de encuestas en los 15 días previos a la elección.

---

## 3. Veda Electoral — Middleware temporal recomendado

Antes del 7 jun, agregar a `routes/api.php`:

```php
Route::prefix('chat')->middleware([
    'throttle:30,1',
    \App\Http\Middleware\CaptureRequestContext::class,
    function ($request, $next) {
        $electionDate = \Carbon\Carbon::parse('2026-06-07 00:00', 'America/Lima');
        $vedaStart = $electionDate->copy()->subDay();
        if (now()->between($vedaStart, $electionDate->endOfDay())) {
            return response()->json([
                'reply' => 'Hoy es día de veda electoral. El chat reabre el lunes 8. ¡Vota informado!',
                'veda' => true,
            ]);
        }
        return $next($request);
    },
])->group(function () {
    // ...rutas chat
});
```

---

## 4. Aviso de IA — Recomendación INDECOPI

Aunque no hay ley peruana específica, **el EU AI Act y Indecopi han marcado pauta** sobre transparencia. Cumplimos con:

- Badge persistente "Asistente IA · No es el candidato en persona" visible siempre.
- Divulgación obligatoria en system prompt cuando el ciudadano pregunta.
- Modal de aviso antes del primer mensaje.

---

## Checklist final antes de lanzar

- [ ] Texto de consentimiento revisado por abogado.
- [ ] Política de privacidad publicada en `/privacidad`.
- [ ] Email `privacidad@dominio` operativo (con auto-responder).
- [ ] Registro del banco de datos en APDP iniciado (90 días desde lanzamiento).
- [ ] Designado un Encargado del Tratamiento (nombre + email).
- [ ] HTTPS obligatorio (Let's Encrypt o Cloudflare).
- [ ] Backups diarios cifrados.
- [ ] Política de retención: borrar sesiones >365 días vía cron.
- [ ] Si lanzas durante campaña: aviso de propaganda electoral conforme al JNE en el footer (logos del partido, candidato, etc.).
