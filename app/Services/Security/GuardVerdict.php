<?php

namespace App\Services\Security;

/** Veredicto de PromptGuard / OutputGuard: categoría + fragmento que disparó (para logs). */
final class GuardVerdict
{
    public function __construct(
        public readonly string $category,
        public readonly ?string $matched = null,
    ) {}

    public static function ok(): self
    {
        return new self(PromptGuard::OK);
    }

    public function blocked(): bool
    {
        return $this->category !== PromptGuard::OK;
    }
}
