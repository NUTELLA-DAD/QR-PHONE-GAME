import { createControllerNetwork } from './network.js';
import { createControllerUI } from './ui.js';
import { createControllerInput } from './input.js';

const network = createControllerNetwork();
const ui = createControllerUI({ network });
ui.setup();
createControllerInput({ network, ui });
