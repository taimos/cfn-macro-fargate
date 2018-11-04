/*
 * Copyright (c) 2018. Taimos GmbH http://www.taimos.de
 */

import * as fs from 'fs';
import {macroHandler} from '../lib/index';

const content : string = fs.readFileSync('tst/testevent.json', {encoding: 'UTF-8'});
const simple = JSON.parse(content);

macroHandler(simple, null).then((value) => {
    console.log(JSON.stringify(value.fragment.Resources.TestServiceHttpsListenerRule, null, 2));
});
