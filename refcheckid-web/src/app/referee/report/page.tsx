import {Suspense} from 'react';
import {AuthGate} from '@/components/auth/auth-gate';
import {PrivateReport} from '@/features/platform/private-report';
export default function RefereeReportPage(){return <AuthGate allowedRole="referee"><Suspense fallback={<p>Caricamento…</p>}><PrivateReport referee/></Suspense></AuthGate>;}
