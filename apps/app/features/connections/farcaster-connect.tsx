"use client";

// import { Button } from '@delulu/design-system/components/ui/button';
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
// } from '@delulu/design-system/components/ui/dialog';
// import { CheckCircle, } from 'lucide-react';
// import { } from 'react';

interface FarcasterConnectProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// interface SignerRequest {
//   token: string;
//   deeplinkUrl: string;
//   qrCodeUrl: string;
// }

// interface SignerStatus {
//   state: 'pending' | 'approved' | 'completed';
//   userFid?: string;
//   user?: {
//     fid: number;
//     username: string;
//     displayName: string;
//     pfp: {
//       url: string;
//     };
//   };
// }

export function FarcasterConnect({
  isOpen,
  onClose,
  onSuccess,
}: FarcasterConnectProps) {
  // const [loading, setLoading] = useState(false);
  // const [signerRequest, setSignerRequest] = useState<SignerRequest | null>(
  //   null
  // );
  // const [status, setStatus] = useState<SignerStatus | null>(null);
  // const [polling, setPolling] = useState(false);

  // const createSignerRequest = async () => {
  //   setLoading(true);
  //   try {
  //     const response = await fetch('/api/farcaster/connect', {
  //       method: 'POST',
  //     });

  //     if (!response.ok) {
  //       throw new Error('Failed to create signer request');
  //     }

  //     const data = await response.json();
  //     setSignerRequest(data);
  //     startPolling(data.token);
  //   } catch (error) {
  //     console.error('Error creating signer request:', error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const startPolling = (token: string) => {
  //   setPolling(true);
  //   const interval = setInterval(async () => {
  //     try {
  //       const response = await fetch(`/api/farcaster/connect?token=${token}`);

  //       if (!response.ok) {
  //         throw new Error('Failed to check status');
  //       }

  //       const statusData = await response.json();
  //       setStatus(statusData);

  //       if (statusData.state === 'completed') {
  //         clearInterval(interval);
  //         setPolling(false);
  //         onSuccess();
  //         onClose();
  //       }
  //     } catch (error) {
  //       console.error('Error checking status:', error);
  //     }
  //   }, 2000); // Poll every 2 seconds

  //   // Stop polling after 5 minutes
  //   setTimeout(() => {
  //     clearInterval(interval);
  //     setPolling(false);
  //   }, 300000);
  // };

  // const handleClose = () => {
  //   setSignerRequest(null);
  //   setStatus(null);
  //   setPolling(false);
  //   onClose();
  // };

  // useEffect(() => {
  //   if (isOpen && !signerRequest) {
  //     createSignerRequest();
  //   }
  // }, [isOpen, signerRequest]);

  // return (
  //   <Dialog open={isOpen} onOpenChange={handleClose}>
  //     <DialogContent className="sm:max-w-md">
  //       <DialogHeader>
  //         <DialogTitle>Connect Farcaster Account</DialogTitle>
  //         <DialogDescription>
  //           Scan the QR code with Warpcast to connect your Farcaster account
  //         </DialogDescription>
  //       </DialogHeader>

  //       <div className="flex flex-col items-center space-y-4 py-4">
  //         {loading && (
  //           <div className="flex items-center space-x-2">
  //             <Icon icon={Loader2} size={16} className=" animate-spin" />
  //             <span>Creating connection request...</span>
  //           </div>
  //         )}

  //         {signerRequest && !status?.user && (
  //           <>
  //             <div className="relative">
  //               <img
  //                 src={signerRequest.qrCodeUrl}
  //                 alt="Farcaster connection QR code"
  //                 width={200}
  //                 height={200}
  //                 className="rounded-lg border"
  //               />
  //               {polling && (
  //                 <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
  //                   <Loader2 className="h-8 w-8 animate-spin text-white" />
  //                 </div>
  //               )}
  //             </div>

  //             <div className="space-y-2 text-center">
  //               <p className="text-muted-foreground text-sm">
  //                 Open Warpcast and scan this QR code
  //               </p>
  //               <Button
  //                 variant="outline"
  //                 size="sm"
  //                 onClick={() =>
  //                   window.open(signerRequest.deeplinkUrl, '_blank')
  //                 }
  //                 className="flex items-center space-x-2"
  //               >
  //                 <Icon icon={ExternalLink} size={16} className="" />
  //                 <span>Open in Warpcast</span>
  //               </Button>
  //             </div>

  //             {status?.state === 'approved' && (
  //               <div className="flex items-center space-x-2 text-muted-foreground text-sm">
  //                 <Icon icon={Loader2} size={16} className=" animate-spin" />
  //                 <span>Completing connection...</span>
  //               </div>
  //             )}
  //           </>
  //         )}

  //         {status?.user && (
  //           <div className="space-y-4 text-center">
  //             <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
  //             <div>
  //               <h3 className="font-medium">{status.user.displayName}</h3>
  //               <p className="text-muted-foreground text-sm">
  //                 @{status.user.username}
  //               </p>
  //             </div>
  //             <p className="text-green-600 text-sm">
  //               Successfully connected to Farcaster!
  //             </p>
  //           </div>
  //         )}
  //       </div>
  //     </DialogContent>
  //   </Dialog>
  // );
  return null;
}
