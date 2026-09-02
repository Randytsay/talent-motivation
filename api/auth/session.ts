import { vercelWebHandler } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

export default vercelWebHandler(createRouteHandlers().session);
