import {Suspense} from 'react';
import {AuthGate} from '@/components/auth/auth-gate';
import {PrivateReport} from '@/features/platform/private-report';
export default function ReportPage(){return <AuthGate allowedRole="federation"><Suspense fallback={<p>Caricamento…</p>}><PrivateReport/></Suspense></AuthGate>;}
