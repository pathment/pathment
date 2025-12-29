'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'mentee' as 'admin' | 'mentor' | 'mentee',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      const dashboard = `/${user.role}/dashboard`;
      router.push(dashboard);
    }
  }, [user, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render register form if user is logged in
  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.email) newErrors.email = 'Email is required';
    if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await register(formData);
      setShowSuccess(true);
      toast.success('Account created! Please verify your email.');
      setTimeout(() => router.push('/verify-email'), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed');
      setErrors({ general: err.response?.data?.message || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo & Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
          <span className="text-primary-foreground text-2xl font-bold">P</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Create your account</h1>
        <p className="text-muted-foreground">Start your mentorship journey today</p>
      </div>

      {/* Registration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Enter your details to create an account</CardDescription>
        </CardHeader>
        <CardContent>
          {showSuccess && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900">
                Account created successfully! Redirecting to email verification...
              </AlertDescription>
            </Alert>
          )}

          {errors.general && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                  placeholder="you@example.com"
                  required
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`pl-10 ${errors.password ? 'border-destructive' : ''}`}
                  placeholder="••••••••"
                  required
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.password}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className={`pl-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                  placeholder="••••••••"
                  required
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>I want to join as</Label>
              <div className="grid grid-cols-3 gap-3">
                {(['mentee', 'mentor', 'admin'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setFormData({ ...formData, role })}
                    className={`p-3 rounded-xl border-2 transition-all capitalize ${
                      formData.role === role
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/50 text-foreground'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                'Creating account...'
              ) : (
                <>
                  Create Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-muted-foreground text-sm">
        By signing up, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
