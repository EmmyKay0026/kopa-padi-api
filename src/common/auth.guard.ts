import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "../auth.js";
import { db } from "../db/database.js";
import { adminCapabilityGrants, journeys, pcmVerifications } from "../db/schema.js";

export const PUBLIC_ROUTE = "publicRoute";
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const ADMIN_ROUTE = "adminRoute";
export const AdminOnly = () => SetMetadata(ADMIN_ROUTE, true);
export const VERIFIED_ROUTE = "verifiedRoute";
export const VerifiedPCMOnly = () => SetMetadata(VERIFIED_ROUTE, true);
export const CAPABILITY_ROUTE='capabilityRoute';
export const RequiresCapability=(capability:string)=>SetMetadata(CAPABILITY_ROUTE,capability);
export const SAFETY_ONLY_ROUTE='safetyOnlyRoute';
export const SafetyOnlyAccess=()=>SetMetadata(SAFETY_ONLY_ROUTE,true);

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  accountStatus: string;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException("Authentication required");
    request.user = session.user as RequestUser;
    const user = request.user as RequestUser;
    const safetyOnly=this.reflector.getAllAndOverride<boolean>(SAFETY_ONLY_ROUTE,[context.getHandler(),context.getClass()]);
    const [activeSafetyJourney]=safetyOnly?await db.select({id:journeys.id}).from(journeys).where(and(eq(journeys.userId,user.id),inArray(journeys.status,['IN_PROGRESS','NEEDS_ATTENTION','ARRIVED']))).limit(1):[];
    if (user.accountStatus !== "ACTIVE") {
      if(!activeSafetyJourney)throw new ForbiddenException("Account is not permitted to access this resource");
    }
    if (
      this.reflector.getAllAndOverride<boolean>(ADMIN_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ]) &&
      user.role !== "ADMIN"
    )
      throw new ForbiddenException("Admin permission required");
    const capability=this.reflector.getAllAndOverride<string>(CAPABILITY_ROUTE,[context.getHandler(),context.getClass()]);
    if(capability){if(user.role!=="ADMIN")throw new ForbiddenException('Moderator permission required');const[grant]=await db.select({capability:adminCapabilityGrants.capability}).from(adminCapabilityGrants).where(and(eq(adminCapabilityGrants.adminUserId,user.id),eq(adminCapabilityGrants.capability,capability as any))).limit(1);if(!grant)throw new ForbiddenException('Required moderator capability is not granted')}
    if (
      this.reflector.getAllAndOverride<boolean>(VERIFIED_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      const [verification] = await db
        .select({ status: pcmVerifications.status })
        .from(pcmVerifications)
        .where(eq(pcmVerifications.userId, user.id))
        .orderBy(desc(pcmVerifications.updatedAt))
        .limit(1);
      if (verification?.status !== "VERIFIED" && !activeSafetyJourney)
        throw new ForbiddenException("PCM verification required");
    }
    return true;
  }
}
