/**
 * QcApprovalsModule — PM-BE-013, PM-BE-014, PM-BE-015
 *
 * Provides:
 *  - SubmissionsService   (task submissions + self-QC)
 *  - QcReviewsService     (QC reviews + bypass records)
 *  - ApprovalsService     (revisions, deliverables, approvals, closeout)
 *  - QcApprovalsController
 */

import { Module } from '@nestjs/common';
import { QcApprovalsController } from './qc-approvals.controller';
import { SubmissionsService } from './submissions.service';
import { QcReviewsService } from './qc-reviews.service';
import { ApprovalsService } from './approvals.service';

@Module({
  controllers: [QcApprovalsController],
  providers: [SubmissionsService, QcReviewsService, ApprovalsService],
  exports: [SubmissionsService, QcReviewsService, ApprovalsService],
})
export class QcApprovalsModule {}
