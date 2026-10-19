import { setCadServiceDownForTests } from '@/lib/cad-service-status';

// The suite tests a working CAD service; cad-service-status.test.ts covers the "down" switch.
setCadServiceDownForTests(false);
