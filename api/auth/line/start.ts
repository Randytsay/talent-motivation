import { toErrorResponse } from '../../../src/server/http';
import { createRouteHandlers } from '../../../src/server/routes';

export default toErrorResponse(createRouteHandlers().lineStart);
