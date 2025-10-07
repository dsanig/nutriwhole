import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { startAuthentication } from '@simplewebauthn/browser';

type AuthMode = 'signin' | 'signup';

const Auth = () => {
  const { user, signIn, signUp, loading, requestPasskeyChallenge } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const passkeySupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window;
  const [mfaStep, setMfaStep] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [deviceName, setDeviceName] = useState('Mi dispositivo');
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    fullName: ''
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (mfaStep) {
      if (!useBackupCode && totpCode.length !== 6) {
        toast({
          variant: "destructive",
          title: "Código inválido",
          description: "Ingresa el código de 6 dígitos generado por tu app."
        });
        setIsLoading(false);
        return;
      }
      if (useBackupCode && backupCode.trim().length === 0) {
        toast({
          variant: "destructive",
          title: "Código de respaldo requerido",
          description: "Ingresa uno de los códigos que guardaste al activar MFA."
        });
        setIsLoading(false);
        return;
      }
    }

    const result = await signIn(signInData.email, signInData.password, mfaStep ? {
      code: useBackupCode ? undefined : totpCode,
      backupCode: useBackupCode ? backupCode : undefined,
      rememberDevice,
      deviceName: deviceName.trim() || undefined
    } : {});

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: result.error.message
      });
    } else if (result.requiresMfa) {
      setMfaStep(true);
      setTotpCode('');
      setBackupCode('');
      setUseBackupCode(false);
      toast({
        title: "Verifica tu identidad",
        description: "Ingresa el código de tu app o un código de respaldo para continuar."
      });
    } else if (result.backupCodes && result.backupCodes.length > 0) {
      toast({
        title: "Códigos de respaldo actualizados",
        description: "Guarda los nuevos códigos entregados por soporte."
      });
      setMfaStep(false);
      setTotpCode('');
      setBackupCode('');
      setUseBackupCode(false);
    } else {
      setMfaStep(false);
      setTotpCode('');
      setBackupCode('');
      setUseBackupCode(false);
    }

    setIsSubmitting(false);
  };

  const handlePasskeySignIn = async () => {
    if (!passkeySupported) {
      toast({
        variant: 'destructive',
        title: 'Passkey no disponible',
        description: 'Tu dispositivo o navegador no soporta passkeys'
      });
      return;
    }

    if (!signInData.email || !signInData.password) {
      toast({
        variant: 'destructive',
        title: 'Completa tu email y contraseña',
        description: 'Necesitamos tus credenciales antes de verificar la passkey'
      });
      return;
    }

    try {
      setPasskeyPending(true);
      const { options, error } = await requestPasskeyChallenge(signInData.email);
      if (error) {
        throw error;
      }
      if (!options) {
        toast({
          variant: 'destructive',
          title: 'Passkey no registrada',
          description: 'Activa una passkey desde el Centro de Seguridad antes de usarla'
        });
        return;
      }

      const assertion = await startAuthentication(options as never);
      const result = await signIn(signInData.email, signInData.password, {
        passkeyAssertion: assertion,
        rememberDevice,
        deviceName: rememberDevice ? deviceName.trim() || undefined : undefined
      });

      if (result.error) {
        throw result.error;
      }

      if (result.requiresMfa) {
        setMfaStep(true);
        toast({
          title: 'Verificación adicional requerida',
          description: 'Ingresa tu código MFA o un respaldo para completar el acceso'
        });
        return;
      }

      setMfaStep(false);
      setTotpCode('');
      setBackupCode('');
      setUseBackupCode(false);
      toast({
        title: 'Ingreso exitoso',
        description: 'Validamos tu passkey correctamente'
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'No se pudo validar la passkey',
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setPasskeyPending(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

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
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold text-center">NutriWhole</CardTitle>
          <CardDescription className="text-center">
            Inicia sesión para continuar o crea una cuenta nueva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Correo electrónico</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={signInData.email}
                    onChange={(event) => setSignInData((state) => ({ ...state, email: event.target.value }))}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Contraseña</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    value={signInData.password}
                    onChange={(event) => setSignInData((state) => ({ ...state, password: event.target.value }))}
                    required
                    disabled={isLoading}
                  />
                </div>

                {mfaStep && (
                  <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Autenticación en dos pasos</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUseBackupCode((prev) => !prev);
                          setTotpCode('');
                          setBackupCode('');
                        }}
                      >
                        {useBackupCode ? 'Usar código de app' : 'Usar código de respaldo'}
                      </Button>
                    </div>

                    {!useBackupCode ? (
                      <div className="space-y-2">
                        <Label htmlFor="totp-code">Código de tu app</Label>
                        <Input
                          id="totp-code"
                          inputMode="numeric"
                          maxLength={6}
                          value={totpCode}
                          onChange={(event) => setTotpCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                          placeholder="123456"
                          disabled={isLoading}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="backup-code">Código de respaldo</Label>
                        <Input
                          id="backup-code"
                          value={backupCode}
                          onChange={(event) => setBackupCode(event.target.value.trim())}
                          placeholder="XXXX-XXXX-XXXX-XXXX"
                          disabled={isLoading}
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember-device"
                        checked={rememberDevice}
                        onCheckedChange={(checked) => setRememberDevice(Boolean(checked))}
                        disabled={isLoading}
                      />
                      <Label htmlFor="remember-device" className="text-sm">
                        Recordar este dispositivo
                      </Label>
                    </div>
                    {rememberDevice && (
                      <div className="space-y-2">
                        <Label htmlFor="device-name">Nombre del dispositivo</Label>
                        <Input
                          id="device-name"
                          value={deviceName}
                          onChange={(event) => setDeviceName(event.target.value)}
                          placeholder="Ej. MacBook de Ana"
                          disabled={isLoading}
                        />
                      </div>
                    )}
                    {passkeySupported && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePasskeySignIn}
                        disabled={passkeyPending}
                      >
                        {passkeyPending ? 'Validando passkey...' : 'Confirmar con passkey'}
                      </Button>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Procesando...' : mfaStep ? 'Confirmar acceso' : 'Iniciar Sesión'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nombre completo</Label>
                  <Input
                    id="signup-name"
                    placeholder="Tu nombre"
                    value={signUpData.fullName}
                    onChange={(event) => setSignUpData((state) => ({ ...state, fullName: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Correo electrónico</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={signUpData.email}
                    onChange={(event) => setSignUpData((state) => ({ ...state, email: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Contraseña</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signUpData.password}
                    onChange={(event) => setSignUpData((state) => ({ ...state, password: event.target.value }))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creando cuenta…' : 'Registrarse'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
