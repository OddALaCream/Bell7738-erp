import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUpdateOwnProfile } from './hooks';
import type { OwnProfile } from './api';

const schema = z.object({
  firstName: z.string().min(1, 'Ingresa un nombre.').max(200),
  lastName: z.string().min(1, 'Ingresa un apellido.').max(200),
});

type FormValues = z.infer<typeof schema>;

export function EditProfileForm({ profile }: { profile: OwnProfile }) {
  const updateProfile = useUpdateOwnProfile();
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: profile.firstName, lastName: profile.lastName },
  });

  useEffect(() => {
    reset({ firstName: profile.firstName, lastName: profile.lastName });
  }, [profile.firstName, profile.lastName, reset]);

  async function onSubmit(values: FormValues) {
    await updateProfile.mutateAsync(values);
    setEditing(false);
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil /> Editar nombre
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Editar nombre</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="own-firstName">Nombre</Label>
            <Input id="own-firstName" {...register('firstName')} />
            {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="own-lastName">Apellido</Label>
            <Input id="own-lastName" {...register('lastName')} />
            {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={isSubmitting}>
              Guardar
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
