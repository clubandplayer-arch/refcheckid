import { handleCloudRequest } from "refcheckid-backend/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = handleCloudRequest;
export const POST = handleCloudRequest;
export const PUT = handleCloudRequest;
export const PATCH = handleCloudRequest;
export const DELETE = handleCloudRequest;
