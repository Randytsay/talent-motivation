import { createRouteHandlers } from '../../src/server/routes';
import { vercelWebHandler } from '../../src/server/http';

export default vercelWebHandler(createRouteHandlers().liffAuthenticate);
