import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { acceptInvitation } from '@/features/auth/api';
import { ApiError } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z
  .object({
    password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await acceptInvitation({ token, password: values.password });
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'INVITATION_INVALID' || error.status === 410)) {
        setFormError(
          'Este enlace de invitación no es válido, ya fue usado o expiró. Contacta a un administrador para solicitar uno nuevo.',
        );
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setFormError(error.fieldMessage('password') ?? 'Revisa los datos ingresados.');
      } else {
        setFormError('No se pudo aceptar la invitación. Inténtalo nuevamente.');
      }
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Aceptar invitación</CardTitle>
          <CardDescription>Define tu contraseña para activar tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-10 text-brand-600" />
              <p className="text-sm font-medium">Tu cuenta fue activada.</p>
              <Button asChild className="w-full">
                <Link to="/login">Ir a iniciar sesión</Link>
              </Button>
            </div>
          ) : !token ? (
            <p className="text-sm text-destructive">
              Este enlace no incluye un token de invitación válido. Verifica que copiaste la URL completa.
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              <Button type="submit" className="w-full" loading={isSubmitting}>
                Activar cuenta
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
