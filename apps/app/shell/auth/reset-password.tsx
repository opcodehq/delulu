// 'use client';

// import { resetPassword } from '@delulu/auth/client';
// import {
//   Alert,
//   AlertDescription,
// } from '@delulu/design-system/components/ui/alert';
// import { Button } from '@delulu/design-system/components/ui/button';
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from '@delulu/design-system/components/ui/card';
// import { Input } from '@delulu/design-system/components/ui/input';
// import { Label } from '@delulu/design-system/components/ui/label';
// import type React from 'react';
// import { useState } from 'react';

// type ResetPasswordProps = {
//   token?: string;
//   onSuccess?: () => void;
//   redirectTo?: string;
// };

// export const ResetPassword = ({
//   token,
//   onSuccess,
//   redirectTo,
// }: ResetPasswordProps) => {
//   const [password, setPassword] = useState('');
//   const [confirmPassword, setConfirmPassword] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState('');

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setError('');

//     if (password !== confirmPassword) {
//       setError('Passwords do not match');
//       setIsLoading(false);
//       return;
//     }

//     if (password.length < 8) {
//       setError('Password must be at least 8 characters long');
//       setIsLoading(false);
//       return;
//     }

//     if (!token) {
//       setError('Invalid reset token');
//       setIsLoading(false);
//       return;
//     }

//     try {
//       const result = await resetPassword({
//         newPassword: password,
//         token,
//       });

//       if (result.data) {
//         if (redirectTo) {
//           window.location.href = redirectTo;
//         } else if (onSuccess) {
//           onSuccess();
//         } else {
//           window.location.href = '/';
//         }
//       }
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Failed to reset password');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <Card className="mx-auto w-full max-w-md">
//       <CardHeader className="space-y-1">
//         <CardTitle className="font-semibold text-2xl tracking-tight">
//           Reset your password
//         </CardTitle>
//         <CardDescription>Enter your new password below</CardDescription>
//       </CardHeader>
//       <CardContent className="space-y-4">
//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="space-y-2">
//             <Label htmlFor="password">New Password</Label>
//             <Input
//               id="password"
//               type="password"
//               placeholder="Enter new password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               minLength={8}
//             />
//           </div>

//           <div className="space-y-2">
//             <Label htmlFor="confirmPassword">Confirm Password</Label>
//             <Input
//               id="confirmPassword"
//               type="password"
//               placeholder="Confirm new password"
//               value={confirmPassword}
//               onChange={(e) => setConfirmPassword(e.target.value)}
//               required
//               minLength={8}
//             />
//           </div>

//           {error && (
//             <Alert variant="destructive">
//               <AlertDescription>{error}</AlertDescription>
//             </Alert>
//           )}

//           <Button type="submit" className="w-full" disabled={isLoading}>
//             {isLoading ? 'Resetting...' : 'Reset password'}
//           </Button>
//         </form>
//       </CardContent>
//     </Card>
//   );
// };
