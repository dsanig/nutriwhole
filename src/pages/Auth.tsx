import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type AuthMode = 'signin' | 'signup';

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({ email: '', password: '', fullName: '' });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const result = await signIn(signInData.email, signInData.password);

    if (result.error) {
      toast({
        variant: 'destructive',
        title: 'Error al iniciar sesión',
        description: result.error.message
      });
    }

    setIsSubmitting(false);
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await signUp(signUpData.email, signUpData.password, signUpData.fullName);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error al registrarse',
        description: error.message
      });
    } else {
      toast({
        title: 'Revisa tu correo electrónico',
        description: 'Te enviamos un enlace para confirmar tu cuenta.'
      });
      setMode('signin');
      setSignUpData({ email: '', password: '', fullName: '' });
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold">NutriWhole</CardTitle>
          <CardDescription>
            {loading
              ? 'Verificando tu sesión actual…'
              : mode === 'signin'
                ? 'Ingresa tus credenciales para acceder a tu cuenta.'
                : 'Completa el formulario para crear una cuenta nueva.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center gap-2" role="tablist" aria-label="Cambiar modo de autenticación">
            <Button
              type="button"
              variant={mode === 'signin' ? 'default' : 'outline'}
              className={cn('w-32', mode === 'signin' && 'cursor-default')}
              onClick={() => setMode('signin')}
              aria-pressed={mode === 'signin'}
            >
              Iniciar sesión
            </Button>
            <Button
              type="button"
              variant={mode === 'signup' ? 'default' : 'outline'}
              className={cn('w-32', mode === 'signup' && 'cursor-default')}
              onClick={() => setMode('signup')}
              aria-pressed={mode === 'signup'}
            >
              Registrarse
            </Button>
          </div>

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="signin-email">Correo electrónico</Label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={signInData.email}
                  onChange={(event) =>
                    setSignInData((state) => ({ ...state, email: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Contraseña</Label>
                <Input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={signInData.password}
                  onChange={(event) =>
                    setSignInData((state) => ({ ...state, password: event.target.value }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
                {isSubmitting ? 'Accediendo…' : 'Iniciar sesión'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="signup-name">Nombre completo</Label>
                <Input
                  id="signup-name"
                  placeholder="Tu nombre"
                  autoComplete="name"
                  value={signUpData.fullName}
                  onChange={(event) =>
                    setSignUpData((state) => ({ ...state, fullName: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Correo electrónico</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={signUpData.email}
                  onChange={(event) =>
                    setSignUpData((state) => ({ ...state, email: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Contraseña</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={signUpData.password}
                  onChange={(event) =>
                    setSignUpData((state) => ({ ...state, password: event.target.value }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
                {isSubmitting ? 'Creando cuenta…' : 'Registrarse'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
