import { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';

export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}


export const validateCreateNotification = [
  body('type')
    .isIn(['Placement', 'Result', 'Event'])
    .withMessage('type must be one of: Placement, Result, Event'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('message').isString().trim().notEmpty().withMessage('message is required'),
  body('studentId').optional().isString().trim(),
  body('metadata').optional().isObject(),
  handleValidationErrors,
];

export const validateListNotifications = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('isRead').optional().isBoolean().toBoolean(),
  query('type').optional().isIn(['Placement', 'Result', 'Event']),
  query('studentId').optional().isString().trim(),
  handleValidationErrors,
];

export const validateNotificationId = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
];

export const validateNotifyAll = [
  body('type')
    .isIn(['Placement', 'Result', 'Event'])
    .withMessage('type must be one of: Placement, Result, Event'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('message').isString().trim().notEmpty().withMessage('message is required'),
  handleValidationErrors,
];
