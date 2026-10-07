const Joi = require('joi');
const { AppError } = require('../utils/AppError');

const OPTIONS = { abortEarly: false, allowUnknown: false, stripUnknown: false, convert: true };

// validate({ body, query, params }) runs before the controller. Unknown fields are rejected (SDD 3).
// The validated values are placed on req.valid so controllers never read raw input.
function validate(schemas) {
  const compiled = {};
  for (const part of ['body', 'query', 'params']) {
    if (schemas[part]) compiled[part] = Joi.isSchema(schemas[part]) ? schemas[part] : Joi.object(schemas[part]);
  }
  return (req, res, next) => {
    const details = [];
    req.valid = {};
    for (const part of Object.keys(compiled)) {
      const { value, error } = compiled[part].validate(req[part] || {}, OPTIONS);
      if (error) {
        for (const d of error.details) {
          details.push({ field: d.path.join('.') || part, issue: d.message.replace(/"/g, '') });
        }
      } else {
        req.valid[part] = value;
      }
    }
    if (details.length > 0) {
      return next(new AppError('VALIDATION_ERROR', 400, 'Request validation failed', details));
    }
    return next();
  };
}

// shared field rules
const id = Joi.string().pattern(/^[a-f0-9]{24}$/).message('must be a 24-character hex id');
const page = Joi.number().integer().min(1).max(100000).default(1);
const dateOnly = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('must be a date in the form YYYY-MM-DD');

module.exports = { validate, Joi, id, page, dateOnly };
