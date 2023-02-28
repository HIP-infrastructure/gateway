import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { IamEbrainsService } from './iam-ebrains.service';

@Injectable()
export class AddHeadersInterceptor implements NestInterceptor {
  constructor(private iamService: IamEbrainsService) { }
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {

    const token = "" // this.iamService.getAuthToken();
    const req = context.switchToHttp().getRequest();
    req.headers.Authorization = `Bearer ${token}`;
    return next.handle()
  }
}