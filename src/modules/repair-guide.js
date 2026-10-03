/**
 * Technician repair guides. Diagrams are layout aids drawn in the app.
 * Video links open a YouTube search for this vehicle and job. They are not
 * hosted procedures, and torque values still come from current service information.
 */

const FAMILIES = {
  brakes: {
    difficulty: 'Intermediate',
    time: '1.5–2.5 hours',
    diagram: 'brakes',
    tools: ['Floor jack and jack stands', 'Torque wrench', 'Brake caliper compressor or wind-back tool', 'Brake micrometer and dial indicator', 'Wire brush and brake cleaner', 'C-clamp only if the piston is a simple push-back style'],
    parts: ['Pads specified for the axle', 'Rotors if measured under spec or included on the work order', 'Hardware kit', 'Approved brake lubricant', 'Brake fluid for top-off'],
    safety: ['Do not road-test a vehicle that pulls hard, has a sinking pedal, or has a leak.', 'Support the caliper. Never hang it from the hose.', 'Keep lubricant and cleaner off the friction surface and the rotor hat.'],
    videos: ['front or rear brake pad and rotor replacement', 'brake caliper slide pin service and bedding procedure'],
    steps: [
      { title: 'Confirm the complaint and the sold job', detail: 'Read the work order before the wheel comes off. Note whether this is pads only, pads and rotors, one axle, or all four. If the pedal still stops the vehicle in a straight line, do a short road test and write down pull, pulsation, grind, or a soft pedal. Photograph the pad face and rotor before disassembly.', watch: 'A soft pedal, fluid leak, or illuminated ABS light is a different job than a pad replacement. Stop and rewrite the estimate.' },
      { title: 'Open the wheel end without loading the hose', detail: 'Loosen the lug nuts on the ground. Lift and support the vehicle only at the approved points. Remove the wheel. Look at the hose, slide boots, piston boot, and anti-rattle clips before you compress anything. Match what you see to the brake diagram: pad, rotor, caliper, and slide pin.', watch: 'Torn boots, a kinked hose, or fluid at the piston means the caliper or hose is part of the repair.', diagram: 'brakes' },
      { title: 'Measure pads and the rotor before parts are committed', detail: 'Measure inner and outer pad thickness. Measure rotor thickness at several clock positions and compare every reading with the discard thickness in current service information for this VIN. Check lateral runout if the complaint is pulsation. Write the numbers on the repair order.', watch: 'A rotor at or under discard, a crack, or a deep groove is not a machine job. Replace it or get authorization before you continue.', diagram: 'measure' },
      { title: 'Remove the caliper and support it', detail: 'Take the caliper off and hang it from the knuckle or a hook with a wire or hook tool. Remove the bracket only if the rotor is coming off. Lay the old pads and clips on the bench in the same orientation so the new hardware goes back the same way.', watch: 'Rounded slide-pin bolts and seized pins need heat, penetrating oil, and the correct socket. Do not pry against the rotor hat.' },
      { title: 'Clean the bracket and service the slides', detail: 'Wire-brush the bracket ears until the new clips sit flat. Replace the hardware kit. Clean and lube only the slide pins and the pad contact points the manufacturer allows. Keep grease off the friction material, the rotor face, and any rubber that is not a slide boot.', watch: 'A pin that will not slide freely is a seized-hardware add-on, not something to force and send down the road.' },
      { title: 'Install the rotor and pads', detail: 'Clean the hub face so the rotor sits flat. Hold the rotor with one lug nut if needed. Open the master-cylinder cap, watch the fluid level, and retract the piston with the correct tool. Wind-back pistons on an electronic parking brake must be retracted with a scan tool, not a clamp. Fit the pads, clips, and caliper. Start every bolt by hand.', watch: 'Fluid overflowing the reservoir, or a piston that will not retract, stops the job until the caliper or parking-brake service is quoted.' },
      { title: 'Torque, seat the pedal, and bed the pads', detail: 'Torque bracket bolts, slide pins, and lug nuts to the current specification, in the wheel sequence. With the vehicle still on stands, pump the pedal until it is high and firm. Then follow the pad maker’s bedding stops if the customer drive allows it. Road-test for pull, noise, and pedal height, and recheck lug torque per shop policy.', watch: 'A pedal that stays low after pumping means air or a leak. Do not deliver the vehicle.' },
    ],
  },
  'brake-flush': {
    difficulty: 'Intermediate',
    time: '0.8–1.2 hours',
    diagram: 'brakes',
    tools: ['Approved catch bottle', 'Bleeder wrench', 'Fresh sealed DOT fluid of the specified type', 'Scan tool if the vehicle needs an ABS bleed'],
    parts: ['About one quart of the specified brake fluid', 'Bleeder caps if they are missing'],
    safety: ['Brake fluid damages paint. Keep it off the finish and wash spills immediately.', 'Do not mix DOT 5 silicone with DOT 3 or DOT 4.', 'An ABS automated bleed is extra if the scan tool procedure is required.'],
    videos: ['brake fluid flush four wheel bleed', 'ABS brake bleed procedure'],
    steps: [
      { title: 'Identify the fluid and the bleed order', detail: 'Read the cap and the service information. Confirm DOT 3, DOT 4, or a low-viscosity variant. Look up the bleed sequence for this VIN. Test the pedal height and look for wet fittings before you open a bleeder.', watch: 'A sinking pedal or a wet hose is a leak diagnosis, not a flush.' },
      { title: 'Protect the reservoir and the paint', detail: 'Suck the old fluid out of the reservoir down to the minimum, then fill with fresh fluid. Leave the cap loose. Put a fender cover over the painted area around the reservoir.', watch: 'If the reservoir is black and sludged, plan to flush until the color at each wheel matches the new fluid.' },
      { title: 'Bleed each wheel in sequence', detail: 'Start at the wheel the service information names first. Open the bleeder only while a helper or a pressure bleeder is pushing fluid. Close it before the pedal is released. Keep the reservoir from running dry. Repeat until the fluid at that wheel is clean, then move to the next wheel. Stay near one quart unless the fluid stays dirty.', watch: 'A bleeder that will not open, or threads that weep, is an extra. Do not round it off and leave it leaking.' },
      { title: 'Finish the pedal and scan', detail: 'Top off to the mark, install the cap, and pump to a firm pedal. If the vehicle uses an ABS or electronic parking-brake bleed, run that routine with a scan tool before the road test. Check every bleeder and the master cylinder for seepage.', watch: 'A soft pedal after a clean flush means air is still in a circuit or the master cylinder is bypassing.' },
    ],
  },
  cooling: {
    difficulty: 'Advanced',
    time: '2.5–4.0 hours',
    diagram: 'cooling',
    tools: ['Drain pan', 'Cooling-system pressure tester', 'Torque wrench', 'Hose clamp pliers', 'Spill-free funnel for bleeding'],
    parts: ['Water pump and gasket or one-time-use seal', 'Thermostat and seal if the job includes it', 'OEM-spec coolant', 'Any one-time-use stretch belt the procedure names'],
    safety: ['Never open a hot, pressurized cap. Wait until the system is cool.', 'Dispose of coolant so animals cannot reach it.', 'Support the engine if a mount has to come off to reach the pump.'],
    videos: ['water pump and thermostat replacement', 'how to bleed air from the cooling system'],
    steps: [
      { title: 'Confirm the leak or the overheat before parts come off', detail: 'Cold-pressure-test the system and note where it weeps: pump weep hole, hose, radiator end tank, or heater core. Record the temperature when the gauge climbs and whether the fans and the upper hose get hot. The cooling diagram shows the loop: pump, thermostat, radiator, and return.', watch: 'A head-gasket smell, white exhaust, or combustion gas in the coolant is not a pump job. Stop and test before you quote a pump.' },
      { title: 'Cool, depressurize, and drain', detail: 'Key off. Confirm the upper hose is not pressurized. Drain at the radiator or the lower hose into a pan. Capture the coolant. Note the color and any oil sheen or rust. Remove the air intake, belt, and covers only as far as the procedure requires to see the pump.', watch: 'Oil in the coolant, or coolant in the oil, changes the repair. Do not refill and send it.' },
      { title: 'Remove the belt and the pump', detail: 'Release the tensioner the way the diagram shows, with a wrench on the tensioner hex, and slip the belt off without bending a pulley. Unbolt the pump. Scrape the old gasket without gouging the aluminum. Compare the new pump impeller and gasket with the old one before it is bolted on.', watch: 'A grooved pulley, a weak tensioner, or a cracked plastic impeller on the old pump should be quoted while the belt is off.' },
      { title: 'Install the pump and thermostat in sequence', detail: 'Follow the torque sequence in service information. Do not use extra sealant where the gasket is already coated. If the thermostat is in this job, install it in the direction stamped on the housing, with the jiggle pin or bleed notch where the procedure shows it. Refit hoses with the clamps back on the bead, not on the hose end.', watch: 'A thermostat installed backwards, or a clamp on the flare, is a comeback. Check both before the belt goes on.' },
      { title: 'Refill, bleed, and pressure-test', detail: 'Mix the specified coolant and distilled water to the ratio on the bottle or the service spec, unless the coolant is premix. Fill through a spill-free funnel. Run the engine with the heater on hot until the thermostat opens and both hoses are hot. Squeeze the hoses to chase air. Top off, cap the system, and pressure-test cold or as the procedure allows.', watch: 'The level dropping after the thermostat opens means air is still burping, or a leak opened up. Do not deliver it low.' },
      { title: 'Road-test to operating temperature', detail: 'Drive until the fan cycles or the gauge sits in the normal range. Watch for heat at idle and heat on the highway. Recheck the level after cooldown and look under the pump and the thermostat housing with a light.', watch: 'Temperature that climbs only at idle points back at airflow and the fan, not at the new pump.' },
    ],
  },
  oil: {
    difficulty: 'Basic',
    time: '0.5–0.8 hours',
    diagram: 'oil',
    tools: ['Drain pan', 'Correct drain-plug socket or wrench', 'Filter wrench', 'Torque wrench', 'Fender covers'],
    parts: ['Oil of the specified viscosity, up to the capacity on the work order', 'Filter that matches the VIN', 'Drain-plug washer if the plug uses one'],
    safety: ['Exhaust and oil are hot. Wear gloves and eye protection.', 'Confirm the vehicle is in park or gear with the brake set before you go underneath.', 'Do not overfill. Extra oil can aerate and damage the engine.'],
    videos: ['oil and filter change procedure', 'drain plug torque and filter install'],
    steps: [
      { title: 'Identify the oil and the filter before you drain', detail: 'Match the viscosity and specification (such as the dexos or European rating on the cap or in service information) to the oil on the van. Confirm the filter and the drain plug tool. Set the lift or ramps so the plug and the filter are both reachable. The diagram shows the pan plug low and the filter on the side or the housing on top.', watch: 'A plastic housing and a cartridge is not a spin-on job. Use the housing tool and replace the O-rings.' },
      { title: 'Drain and inspect the plug', detail: 'Start the drain with the engine warm, not scalding. Crack the plug, then remove it by hand so it does not fall into the pan. Look at the magnet or the plug face for metal. Replace the washer if the procedure calls for a new one. Let it drain until it slows to a drip.', watch: 'Chunks of metal or a strong fuel smell in the oil is a diagnosis, not a normal service. Stop and show the service writer.' },
      { title: 'Change the filter without double-gasketing', detail: 'Remove the old filter. Confirm the old gasket came off with it. Oil the new gasket with clean oil. Spin the filter on until the gasket contacts, then the additional turn the filter maker prints on the can. For a cartridge, lube the new O-rings and torque the cap to spec.', watch: 'A gasket left on the engine will blow oil out as soon as it starts.' },
      { title: 'Fill, run, and set the level', detail: 'Install the plug and torque it. Add the quantity on the work order, which caps conventional and synthetic jobs at about five quarts unless the estimate added more. Start the engine, confirm oil pressure, shut it off, wait, and set the level on the dipstick or the electronic gauge. Reset the oil-life monitor if the vehicle has one. Check the plug and the filter for seepage.', watch: 'The level climbing above full, or a drip at the plug, gets fixed before the vehicle leaves the bay.' },
    ],
  },
  battery: {
    difficulty: 'Basic',
    time: '0.6–1.0 hours',
    diagram: 'battery',
    tools: ['Memory saver if the customer wants radio and window settings kept', 'Terminal cleaner', 'Torque wrench or terminal tool', 'Battery tester', 'Scan tool for registration when the vehicle requires it'],
    parts: ['Battery of the correct group size and type on the work order', 'Anti-corrosion washers or spray', 'Hold-down hardware if the old hardware is broken'],
    safety: ['Disconnect the negative cable first and reconnect it last.', 'Keep the positive from touching body metal.', 'AGM and EFB batteries are an upgrade, not a substitute for a flooded battery on the menu price.'],
    videos: ['car battery replacement negative first', 'battery registration after replacement'],
    steps: [
      { title: 'Test the battery and the charging system first', detail: 'Load-test or conductance-test the battery and record the result. With the engine running, check charging voltage. A battery that tests good with a weak alternator is not fixed by a new battery. The diagram shows negative to the body and positive through the fuse box.', watch: 'Charging voltage that stays low or climbs past the spec means finish the charging test before you sell a battery.' },
      { title: 'Save memory and disconnect negative first', detail: 'Connect a memory saver if you are keeping adaptations. Switch the ignition off. Remove the negative cable, then the positive, then the hold-down. Note the vent hose and the heat shield on vehicles that use them.', watch: 'A swollen case or a wet tray is a reason to quote the tray and the cables, not only the battery.' },
      { title: 'Clean the terminals and the tray', detail: 'Neutralize corrosion, brush the posts and the clamps, and rinse so powder does not stay in the tray. Confirm the new battery group size, terminal location, and CCA match the job. Flooded, AGM, and EFB are not interchangeable on this menu.', watch: 'A clamp that will not tighten, or a post that rocks, needs a new cable end.' },
      { title: 'Install, torque, and register', detail: 'Set the battery, install the hold-down, connect positive, then negative. Torque the clamps so they cannot rotate by hand. Protect the posts. If service information requires battery registration or a reset, do that with a scan tool before you close the hood. Recheck charging voltage.', watch: 'A vehicle that will not start after the swap, or a stop-start light that stays on, usually still needs registration or a charging repair.' },
    ],
  },
  belt: {
    difficulty: 'Intermediate',
    time: '0.8–1.5 hours',
    diagram: 'belt',
    tools: ['Serpentine-belt tool or the correct wrench for the tensioner', 'Torque wrench', 'Inspection light'],
    parts: ['Belt that matches the VIN and the accessory layout', 'Tensioner or idler only if they failed inspection and were quoted'],
    safety: ['Release the tensioner in the direction it is built to move. Do not pry the belt off a spinning pulley.', 'Keep fingers clear when the tensioner snaps back.', 'Confirm the routing diagram under the hood or in service information before the old belt comes off.'],
    videos: ['serpentine belt replacement tensioner', 'belt routing diagram'],
    steps: [
      { title: 'Photograph the routing and inspect the pulleys', detail: 'With the engine off, photograph the belt path. Compare it with the underhood sticker and with the belt diagram: crank at the bottom, tensioner arrow, alternator, and idlers. Spin each pulley by hand. A groaning tensioner, a wobbly idler, or a pulley that grinds gets quoted before the new belt goes on.', watch: 'The menu price is the belt. Tensioners, idlers, and damaged pulleys are a revised quote.' },
      { title: 'Release the tensioner and remove the belt', detail: 'Put the tool on the tensioner hex or square and rotate it the way the arrow shows, only far enough to slip the belt off one pulley. Do not let the tensioner slam. Pull the belt and note any glazing, cord, or rib that is missing.', watch: 'A tensioner that will not move, or that sits against the stop, is worn. Replace it on this visit if the customer approves.' },
      { title: 'Route the new belt and release the tensioner slowly', detail: 'Follow the photo and the sticker rib by rib. The belt ribs sit in the grooved pulleys. The back of the belt rides the smooth pulleys. Keep the tensioner loaded, seat the belt, and let the tensioner return under control.', watch: 'One rib off a pulley will shred the belt on startup. Recheck every pulley before you start the engine.' },
      { title: 'Run and look for tracking', detail: 'Start the engine and watch the belt from a safe distance. It should run in the center of each pulley without walking off or chirping. Shut it off and confirm the tensioner mark, if it has one, is in the normal range.', watch: 'A chirp that remains is usually a pulley or a misroute, not a reason to spray the belt.' },
    ],
  },
  'air-filter': {
    difficulty: 'Basic',
    time: '0.3–0.5 hours',
    diagram: 'filter',
    tools: ['Screwdriver or the housing clip tool', 'Shop vacuum or a rag for the airbox', 'Flashlight'],
    parts: ['One standard engine air filter for the VIN'],
    safety: ['Do not start the engine with the airbox open.', 'A performance or dual-filter housing is outside the standard menu price.'],
    videos: ['engine air filter replacement airbox'],
    steps: [
      { title: 'Open the airbox without breaking the clips', detail: 'Unclip or unbolt the lid. Note which sensors and hoses stay on the lid. Lift the old filter straight out and compare the shape with the new one before you throw the old filter away.', watch: 'A housing that uses a different filter, or two filters, is a specialty application. Revise the price.' },
      { title: 'Clean the box and seat the new filter', detail: 'Vacuum leaves and dirt out of the box. Wipe the sealing face. Set the new filter so the seal is even all the way around. Close the lid and fasten every clip. Reconnect any hose you moved.', watch: 'A filter that sits crooked will let dirt past the seal. Reopen the box and seat it again.' },
      { title: 'Confirm the intake is closed', detail: 'Trace the tube from the box to the throttle body. Clamps should be on the bead. Start the engine and listen for a whistle at the lid.', watch: 'A whistle means the lid or a clamp is still open.' },
    ],
  },
  'cabin-filter': {
    difficulty: 'Basic',
    time: '0.4–0.8 hours',
    diagram: 'filter',
    tools: ['Trim tool', 'Flashlight', 'Vacuum for the housing'],
    parts: ['One standard cabin or pollen filter'],
    safety: ['A carbon or two-piece filter, or a filter behind the cowl, is an upgrade when access is not the glovebox door.', 'Do not break the glovebox stop if the procedure says to release it.'],
    videos: ['cabin air filter replacement glovebox'],
    steps: [
      { title: 'Find the housing', detail: 'Most filters are behind the glovebox. Empty the glovebox, release the stop or the damper the service information shows, and let the door hang. If the filter is under the cowl, the wiper cowl panel has to come off and that labor is extra.', watch: 'Leaves packed in the cowl mean the housing should be cleaned or the new filter loads up immediately.' },
      { title: 'Note the airflow arrow and remove the old filter', detail: 'Open the cover. Photograph the arrow on the old filter. Slide it out without dumping debris into the blower. Vacuum the housing.', watch: 'A damp filter or a musty housing is a reason to tell the customer, and to dry the box before the new filter goes in.' },
      { title: 'Install with the arrow pointing the correct way', detail: 'Match the new filter arrow to the old one and to the arrow molded in the housing. Slide it in without folding the media. Reinstall the cover, the glovebox stops, and any trim you removed. Run the fan and confirm airflow at the vents.', watch: 'An arrow aimed the wrong way can pull debris into the blower and reduce airflow.' },
    ],
  },
  wipers: {
    difficulty: 'Basic',
    time: '0.3 hours',
    diagram: 'wipers',
    tools: ['Fender cover', 'Small flat tool for the connector if it is the pinch type'],
    parts: ['Two standard beam or hybrid blades of the correct lengths'],
    safety: ['Keep the arms from snapping onto the glass while the blade is off.', 'Washer fluid that is oily or contaminated gets flushed, not topped off.'],
    videos: ['wiper blade replacement connector types'],
    steps: [
      { title: 'Match the length and the connector', detail: 'Measure both blades or read the old part. Driver and passenger lengths are often different. Identify the connector: hook, pinch tab, or side pin. Lay a fender cover on the glass.', watch: 'A rear blade or a specialty connector is not included in the two-blade menu price.' },
      { title: 'Swap the blades and park the arms', detail: 'Lift the arm, release the connector, and install the new blade until it clicks. Lower the arm onto the glass. Do not let it drop. Repeat on the other side.', watch: 'An arm that sits high or hits the cowl needs the park position checked before the customer leaves.' },
      { title: 'Test the washers and the wipe', detail: 'Fill the washer reservoir if it is low. Spray and run the wipers. The glass should clear in one or two passes without streaking or chatter.', watch: 'A streak that remains is usually glass contamination or a twisted arm, not a reason to replace the blade again immediately.' },
    ],
  },
  rotation: {
    difficulty: 'Basic',
    time: '0.4–0.6 hours',
    diagram: 'rotation',
    tools: ['Torque wrench', 'Jack or lift', 'Tread depth gauge', 'Pressure gauge'],
    parts: ['No parts on a rotation-only job'],
    safety: ['Torque lug nuts to the specification for this vehicle, not a generic guess.', 'A tire at the wear bars, or with a bulge, does not go back on the vehicle.'],
    videos: ['tire rotation pattern FWD AWD', 'lug nut torque star pattern'],
    steps: [
      { title: 'Record depth and choose the pattern', detail: 'Measure tread at each tire and note the drive layout. Front-wheel drive usually moves the fronts straight back and crosses the rears forward. All-wheel drive and directional tires follow the pattern in service information or on the sidewall. Do not cross a directional tire.', watch: 'More than 2/32 inch of difference, or a tire with a plug in the shoulder, gets shown to the customer before you rotate.' },
      { title: 'Move the tires and seat the wheels', detail: 'Mark the wheels if it helps you keep the pattern. Clean the hub face if rust holds the wheel off-center. Install by hand, then snug the lugs in a star before the vehicle comes down.', watch: 'A wheel that will not sit flush has debris on the hub or the wrong wheel. Do not pull it on with the lug nuts.' },
      { title: 'Torque and set pressures', detail: 'Lower the vehicle and torque in a star to the door-sticker or service specification. Set pressures to the placard, including the spare if you touched it. Reset the indirect TPMS if the procedure requires a drive cycle or a button.', watch: 'A lug that will not reach torque, or a stud that spins, stops the job until the stud is repaired.' },
    ],
  },
  nostart: {
    difficulty: 'Intermediate',
    time: '0.8–1.2 hours',
    diagram: 'battery',
    tools: ['Battery tester', 'Digital multimeter', 'Inductive amp clamp', 'Scan tool'],
    parts: ['No parts until the test names a failed component'],
    safety: ['Keep clear of the fan and belts during a cranking test.', 'Do not jump a swollen or frozen battery.', 'This menu item is the three-test written result, not the repair.'],
    videos: ['no start battery starter alternator test', 'voltage drop test starter circuit'],
    steps: [
      { title: 'Separate no-crank from crank-no-start', detail: 'Ask what the driver heard: click, slow crank, or a normal crank with no fire. Confirm park or clutch, the security light, and fuel level. Record battery voltage at rest.', watch: 'A security light or a no-communication scan is outside the three-test menu. Tell the service writer before you go further.' },
      { title: 'Load-test the battery', detail: 'Test the battery at the posts, not only at the clamps. Record voltage and the tester decision. Clean and retest if the clamps are the weak point. A marginal battery gets replaced or charged before you condemn the starter.', watch: 'Voltage under about 12.4 at rest, or a fail on the load test, means the starter-draw number is not valid until the battery is known good.' },
      { title: 'Measure starter draw and voltage drop', detail: 'Clamp the amp probe on the battery cable and crank. Compare the draw with the specification for this starter. Measure voltage drop on the positive cable and on the ground while cranking. A large drop on a cable is a connection or cable fault, not a starter.', watch: 'Draw that is far above spec with a good battery and clean cables supports starter replacement. Quote it. Do not install it inside the diagnostic price.' },
      { title: 'Test charging and write the go or no-go', detail: 'If the engine will run, measure charging voltage at idle and with loads. Write three lines on the repair order: battery pass or fail, starter circuit pass or fail, alternator pass or fail. Credit the diagnostic toward a same-visit repair if the customer approves that repair.', watch: 'Leave the written result even if the customer declines the repair.' },
    ],
  },
  fuel: {
    difficulty: 'Intermediate',
    time: '0.8–1.2 hours',
    diagram: 'general',
    tools: ['Scan tool', 'Induction tool or the approved on-car cleaner kit', 'Fender covers', 'Fire extinguisher within reach'],
    parts: ['DI-safe induction or on-car cleaner', 'Tank additive specified for the job'],
    safety: ['This is a chemical service, not injector removal.', 'Keep cleaner off paint and off hot exhaust.', 'Do not introduce cleaner into a vacuum port the manufacturer does not allow.'],
    videos: ['direct injection intake valve cleaning on car', 'fuel system treatment procedure'],
    steps: [
      { title: 'Confirm it is a cleaning, not a diagnosis', detail: 'Read fuel trims and look for misfire counts before you introduce chemical. A lean code, a fuel-pressure fault, or a single-cylinder misfire needs diagnosis first. Tell the customer this service does not remove the injectors.', watch: 'Active misfire or a pressure code means stop and diagnose.' },
      { title: 'Introduce the DI-safe cleaner the approved way', detail: 'Follow the tool instructions for an induction or rail service that is safe on direct injection. Keep shop air and cleaner pressure inside the tool’s limit. Run the engine at the speed the procedure names until the chemical is consumed. Add the tank additive.', watch: 'A stumble that does not clear, or a hydrolock risk from too much liquid, means shut it down and pull the chemical back out of the intake.' },
      { title: 'Clear the idle and road-test', detail: 'Let the idle settle. Look for smoke that clears, then road-test. Recheck trims and misfire counters. Write the before-and-after feel on the repair order.', watch: 'A misfire that remains is an ignition, mechanical, or injector-replacement diagnosis, not a second bottle of the same chemical.' },
    ],
  },
  transmission: {
    difficulty: 'Advanced',
    time: '1.5–2.5 hours',
    diagram: 'general',
    tools: ['Drain pan', 'Torque wrench', 'Fluid transfer pump', 'Scan tool for temperature and level', 'New filter and gasket if the pan is serviceable'],
    parts: ['Up to about six quarts of the specified ATF', 'Filter and gasket when the pan is serviceable'],
    safety: ['Fluid temperature for the level check is part of the procedure. A cold level reading is wrong.', 'A sealed unit, a machine exchange, and extra fluid are quoted separately.', 'Hot fluid burns. Lower the pan slowly.'],
    videos: ['transmission fluid and filter service check level at temperature', 'ATF drain and fill procedure'],
    steps: [
      { title: 'Confirm the unit is serviceable', detail: 'Look up whether this transmission has a pan, a filter, and a level plug, or whether it is sealed. Identify the exact ATF specification. Scan for transmission codes and record the fluid color and smell before you drain.', watch: 'Burnt fluid with metal, or a slip complaint, is a diagnosis. A drain-and-fill will not fix a failing unit, and it can change how it behaves. Tell the customer first.' },
      { title: 'Drain, drop the pan if it is serviceable, and replace the filter', detail: 'Drain at the plug. Support the pan, remove it, and dump it in the drain container. Clean the magnet and note the debris. Replace the filter and the gasket. Sealant goes only where the procedure allows, and only as a thin film.', watch: 'A magnet full of metal stops the service. Show it to the service writer before you refill.' },
      { title: 'Refill and set the level at temperature', detail: 'Pump in the quantity that came out, then follow the level-plug procedure at the scan-tool temperature. Shift through the gears with the brake applied if the procedure says to. Recheck the plug for seepage. Cap the job near six quarts unless extra fluid was sold.', watch: 'Overfilling causes aeration and venting. Underfilling causes slip. Do not guess the level on a cold unit.' },
      { title: 'Road-test shift quality', detail: 'Drive through the gears the customer uses. Feel for flare, harsh shifts, or a delayed engagement. Recheck for leaks at the pan and the fill plug when you return.', watch: 'A new shift complaint that was not there before the service gets documented and the level rechecked before the vehicle is delivered.' },
    ],
  },
  differential: {
    difficulty: 'Intermediate',
    time: '0.8–1.2 hours',
    diagram: 'general',
    tools: ['Drain pan', 'Pump for gear oil', 'Torque wrench', 'Thread sealant if the plugs require it'],
    parts: ['Up to about three quarts of the specified synthetic gear oil', 'Limited-slip additive when the unit requires it'],
    safety: ['A second differential, a cover that needs a gasket, and an AWD transfer case are upgrades.', 'Gear oil on the exhaust will smoke. Wipe the housing.'],
    videos: ['differential fluid change drain and fill', 'limited slip additive gear oil'],
    steps: [
      { title: 'Identify which housing and which oil', detail: 'Confirm front, rear, or the single housing. Read the required oil and whether limited-slip additive is required. This menu is one housing and about three quarts.', watch: 'Two differentials or a cover that is leaking at the gasket is a different estimate.' },
      { title: 'Drain and inspect the plug', detail: 'Crack the fill plug first so you are never stuck with a drained housing and a fill plug that will not open. Then remove the drain plug. Look for metal on the magnet.', watch: 'Chunks of gear metal mean stop. Fluid service will not quiet a failing bearing or gear set.' },
      { title: 'Fill to the plug and clean up', detail: 'Pump oil in until it seeps at the fill hole, or to the quantity in service information, whichever the procedure uses. Install the additive when this unit requires it. Torque both plugs. Wipe the housing and the exhaust.', watch: 'A plug that weeps needs sealant or a new plug, not a second attempt with the same damaged threads.' },
    ],
  },
  ignition: {
    difficulty: 'Advanced',
    time: '2.5–4.5 hours',
    diagram: 'general',
    tools: ['Spark-plug socket and extension', 'Torque wrench', 'Dielectric grease', 'Scan tool', 'Compressed air to blow out the wells'],
    parts: ['Six iridium or platinum plugs of the specified heat range for a V6', 'Six OE-quality coils when the job includes coils', 'New boots if they are not part of the coil'],
    safety: ['Let the engine cool. A plug in a hot aluminum head can strip or seize.', 'Blow debris out of the well before the plug comes out so it does not fall into the cylinder.', 'Intake removal on a transverse V6 is a revised quote.'],
    videos: ['V6 spark plug and ignition coil replacement', 'spark plug torque and dielectric grease'],
    steps: [
      { title: 'Scan and record misfire counts first', detail: 'Save codes and misfire counters before you clear anything. Note which cylinder is the offender. A tune-up on a mechanical misfire wastes the plugs. Blow out each plug well.', watch: 'Coolant or oil in a plug well means the tube seal or the valve cover is part of the job. Quote it while the coil is off.' },
      { title: 'Remove one coil and one plug at a time', detail: 'Unbolt the coil, unplug it, and pull it straight out. Remove that plug, read the color, gap the new plug only if it is not pregapped to spec, and install it. A small amount of dielectric grease goes in the boot, not on the electrode. Torque the plug. Seat the coil and its bolt before you move to the next cylinder.', watch: 'A plug that will not turn needs penetrant and patience. Forcing it strips the head.' },
      { title: 'Replace the coils that the job includes', detail: 'On a six-coil job, install the new coils as you go so each connector is accounted for. Listen for a full click on every connector. Reroute any harness you moved so it cannot melt on the exhaust.', watch: 'A connector lock that is broken will cause an intermittent misfire. Repair the terminal before you close the cover.' },
      { title: 'Clear, relearn, and road-test', detail: 'Reconnect the battery if it was disconnected. Clear the codes the procedure allows. Start the engine and listen for a smooth idle. Road-test under the same load that set the misfire. Confirm the counters stay at zero.', watch: 'A misfire that remains on one cylinder after plugs and coils points at compression, an injector, or wiring. Do not keep swapping parts.' },
    ],
  },
  general: {
    difficulty: 'Intermediate',
    time: 'Varies — confirm the labor operation',
    diagram: 'general',
    tools: ['Scan tool when the system is electronic', 'Torque wrench', 'Service information for this VIN', 'Fender covers and the lifting equipment the job requires'],
    parts: ['Parts confirmed by VIN after inspection', 'One-time-use fasteners, seals, and fluids named in the procedure'],
    safety: ['This guide is a workflow, not a substitute for the current manufacturer procedure.', 'Stop if the condition on the vehicle does not match the authorized repair.', 'Look up torque, fluid, and programming steps for this VIN before assembly.'],
    videos: ['repair procedure', 'torque specs service precautions'],
    steps: [
      { title: 'Verify the vehicle and the authorization', detail: 'Match the VIN, the complaint, and the sold operation. Open current service information for this vehicle and read the precautions, the torque list, and any one-time-use parts before the first bolt comes out. Photograph connectors and routing you will disturb.', watch: 'A different engine, a different axle, or an open recall that overlaps this job changes the procedure. Confirm it now.' },
      { title: 'Baseline the concern', detail: 'Scan and save codes if the system is electronic. Record fluid level, leak evidence, noise, and any measurement the procedure asks for before disassembly. Road-test only when it is safe and the complaint needs to be felt.', watch: 'If you cannot reproduce the complaint, write down the conditions and ask for more detail before parts are ordered.' },
      { title: 'Protect the vehicle and isolate energy', detail: 'Use fender covers, lug-nut caps, and a battery disconnect when the procedure requires it. Support the vehicle at approved points. Contain fuel, oil, coolant, and refrigerant. High-voltage systems stay locked out under the manufacturer procedure.', watch: 'A repair that needs refrigerant recovery, airbag work, or high-voltage certification stops until that equipment and training are in the bay.' },
      { title: 'Disassemble only as far as the procedure requires', detail: 'Follow the sequence. Bag fasteners by location. Replace clips and seals that the procedure calls one-time-use. Compare the new part with the old one before it is installed. Clean mating surfaces without gouging aluminum.', watch: 'Hidden damage, stripped threads, or a broken connector is a revised estimate, not something to glue and hide.' },
      { title: 'Assemble to the specification', detail: 'Install in the reverse sequence unless the procedure says otherwise. Torque and angle-tighten in the published order. Refill with the specified fluid and bleed or program if the procedure includes that step. Reroute harnesses away from heat and moving parts.', watch: 'A bolt that will not reach torque is not “close enough.” Repair the thread or replace the fastener.' },
      { title: 'Verify the original complaint is gone', detail: 'Clear codes only when the procedure says to. Road-test in the same conditions as the complaint. Recheck for leaks, warning lights, and noises. Record the final readings and any remaining recommendation on the repair order.', watch: 'A new noise or a light that was not there at the start gets fixed or disclosed before delivery.' },
    ],
  },
};

FAMILIES.callout = {
  difficulty: 'Basic',
  time: 'Trip time',
  diagram: 'general',
  tools: ['Camera', 'The work order and the address'],
  parts: ['None'],
  safety: ['Do not enter a closed garage or a yard you were not given access to.', 'If the vehicle is inaccessible, document it and leave. Do not force a lock.'],
  videos: ['mobile mechanic arrival inspection'],
  steps: [
    { title: 'Confirm the address and a way to reach the customer', detail: 'Call or text when you are close. If nobody answers and the vehicle is locked, gated, or not there, photograph the location and the time.', watch: 'A same-day reschedule can waive the fee when the drive was not wasted. A no-show after you arrived is the call-out fee.' },
    { title: 'Write what stopped the job', detail: 'Note locked vehicle, no access, wrong address, or unsafe conditions. Attach the photos to the work order so the fee is explainable.', watch: 'Do not start a repair you cannot finish because of missing authorization or missing access.' },
  ],
};

function svg(label, body) {
  return `<svg class="repair-diagram" viewBox="0 0 360 210" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="210" rx="8" fill="#e7efe9"/><text x="16" y="24" fill="#1c3a32" font-family="sans-serif" font-size="13" font-weight="700">${label}</text>${body}</svg>`;
}

const DIAGRAMS = {
  brakes: svg('Brake corner', `
    <circle cx="168" cy="118" r="62" fill="#8aa0a6"/>
    <circle cx="168" cy="118" r="28" fill="#d7dee0"/>
    <circle cx="168" cy="118" r="10" fill="#1c3a32"/>
    <rect x="126" y="52" width="84" height="28" rx="6" fill="#1c3a32"/>
    <rect x="146" y="78" width="18" height="22" fill="#c45c26"/>
    <rect x="172" y="78" width="18" height="22" fill="#c45c26"/>
    <text x="132" y="70" fill="#f4f7f4" font-family="sans-serif" font-size="10">Caliper</text>
    <text x="118" y="168" fill="#1c3a32" font-family="sans-serif" font-size="11">Rotor</text>
    <text x="196" y="108" fill="#1c3a32" font-family="sans-serif" font-size="11">Pads</text>
    <line x1="250" y1="90" x2="300" y2="70" stroke="#1c3a32" stroke-width="3"/>
    <circle cx="308" cy="64" r="8" fill="#d7f56a" stroke="#1c3a32"/>
    <text x="250" y="58" fill="#1c3a32" font-family="sans-serif" font-size="11">Slide pin</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Support the caliper. Do not hang it from the hose.</text>`),
  measure: svg('Measure before you replace', `
    <rect x="70" y="78" width="150" height="16" rx="3" fill="#8aa0a6"/>
    <rect x="78" y="96" width="134" height="8" fill="#d7dee0"/>
    <path d="M40 70 h40 v70 h-40 z" fill="#1c3a32"/>
    <path d="M210 70 h40 v70 h-40 z" fill="#1c3a32"/>
    <text x="48" y="108" fill="#f4f7f4" font-family="sans-serif" font-size="10">Mic</text>
    <text x="232" y="150" fill="#1c3a32" font-family="sans-serif" font-size="12">Discard thickness</text>
    <text x="232" y="168" fill="#c45c26" font-family="sans-serif" font-size="12">from service info</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Measure several points. One thin spot fails the rotor.</text>`),
  cooling: svg('Cooling loop', `
    <rect x="40" y="70" width="90" height="70" rx="8" fill="#1c3a32"/>
    <text x="58" y="110" fill="#f4f7f4" font-family="sans-serif" font-size="12">Engine</text>
    <circle cx="150" cy="150" r="22" fill="#8aa0a6" stroke="#1c3a32" stroke-width="3"/>
    <text x="128" y="188" fill="#1c3a32" font-family="sans-serif" font-size="11">Pump</text>
    <rect x="210" y="48" width="28" height="36" rx="4" fill="#c45c26"/>
    <text x="248" y="70" fill="#1c3a32" font-family="sans-serif" font-size="11">Thermostat</text>
    <rect x="250" y="90" width="70" height="80" rx="6" fill="#d7dee0" stroke="#1c3a32"/>
    <text x="262" y="135" fill="#1c3a32" font-family="sans-serif" font-size="12">Radiator</text>
    <path d="M130 80 H210" stroke="#1c3a32" stroke-width="3" fill="none"/>
    <path d="M224 84 H250" stroke="#1c3a32" stroke-width="3" fill="none"/>
    <path d="M285 170 H172" stroke="#1c3a32" stroke-width="3" fill="none"/>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Bleed until both hoses are hot, then pressure-test.</text>`),
  oil: svg('Oil service', `
    <rect x="80" y="40" width="160" height="70" rx="10" fill="#1c3a32"/>
    <text x="130" y="80" fill="#f4f7f4" font-family="sans-serif" font-size="13">Engine</text>
    <rect x="120" y="110" width="80" height="36" rx="4" fill="#8aa0a6"/>
    <circle cx="160" cy="162" r="8" fill="#c45c26"/>
    <text x="176" y="166" fill="#1c3a32" font-family="sans-serif" font-size="11">Drain plug</text>
    <rect x="250" y="78" width="36" height="48" rx="6" fill="#d7f56a" stroke="#1c3a32"/>
    <text x="292" y="106" fill="#1c3a32" font-family="sans-serif" font-size="11">Filter</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Old gasket must come off with the filter.</text>`),
  battery: svg('Battery connections', `
    <rect x="120" y="50" width="120" height="90" rx="8" fill="#1c3a32"/>
    <rect x="145" y="34" width="16" height="20" fill="#c45c26"/>
    <rect x="198" y="34" width="16" height="20" fill="#24302c"/>
    <text x="136" y="100" fill="#f4f7f4" font-family="sans-serif" font-size="13">Battery</text>
    <text x="108" y="30" fill="#c45c26" font-family="sans-serif" font-size="12">+</text>
    <text x="220" y="30" fill="#1c3a32" font-family="sans-serif" font-size="12">−</text>
    <path d="M206 34 H280 V150" stroke="#24302c" stroke-width="4" fill="none"/>
    <text x="250" y="170" fill="#1c3a32" font-family="sans-serif" font-size="11">Negative first off, last on</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Register the battery when the scan tool requires it.</text>`),
  belt: svg('Belt routing', `
    <circle cx="180" cy="150" r="28" fill="#8aa0a6" stroke="#1c3a32" stroke-width="4"/>
    <text x="164" y="154" fill="#1c3a32" font-family="sans-serif" font-size="11">Crank</text>
    <circle cx="100" cy="70" r="22" fill="#d7dee0" stroke="#1c3a32" stroke-width="4"/>
    <text x="78" y="48" fill="#1c3a32" font-family="sans-serif" font-size="11">Alternator</text>
    <circle cx="250" cy="80" r="16" fill="#d7f56a" stroke="#1c3a32" stroke-width="4"/>
    <text x="230" y="48" fill="#1c3a32" font-family="sans-serif" font-size="11">Tensioner</text>
    <path d="M112 88 Q180 40 236 86 Q250 120 196 140 Q140 150 108 90" fill="none" stroke="#1c3a32" stroke-width="5"/>
    <text x="16" y="188" fill="#3d5148" font-family="sans-serif" font-size="11">Photograph the real routing before the belt comes off.</text>`),
  filter: svg('Filter direction', `
    <rect x="70" y="60" width="150" height="90" rx="8" fill="#1c3a32"/>
    <rect x="88" y="78" width="114" height="54" rx="4" fill="#d7f56a"/>
    <path d="M230 105 h54" stroke="#c45c26" stroke-width="4" fill="none"/>
    <polygon points="300,105 284,97 284,113" fill="#c45c26"/>
    <text x="96" y="110" fill="#1c3a32" font-family="sans-serif" font-size="13">Filter</text>
    <text x="236" y="96" fill="#c45c26" font-family="sans-serif" font-size="12">Airflow</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Match the arrow to the housing before you close the cover.</text>`),
  wipers: svg('Wiper swap', `
    <path d="M40 150 Q180 40 320 150" fill="none" stroke="#8aa0a6" stroke-width="10"/>
    <rect x="150" y="78" width="70" height="14" rx="4" transform="rotate(-28 150 78)" fill="#1c3a32"/>
    <rect x="188" y="70" width="46" height="10" rx="3" transform="rotate(-28 188 70)" fill="#d7f56a"/>
    <text x="16" y="40" fill="#1c3a32" font-family="sans-serif" font-size="12">Arm</text>
    <text x="250" y="70" fill="#1c3a32" font-family="sans-serif" font-size="12">New blade</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Do not let the arm snap onto the glass.</text>`),
  rotation: svg('Rotation pattern', `
    <rect x="70" y="40" width="70" height="110" rx="16" fill="none" stroke="#1c3a32" stroke-width="3"/>
    <circle cx="88" cy="62" r="12" fill="#d7f56a" stroke="#1c3a32"/>
    <circle cx="122" cy="62" r="12" fill="#d7dee0" stroke="#1c3a32"/>
    <circle cx="88" cy="128" r="12" fill="#d7dee0" stroke="#1c3a32"/>
    <circle cx="122" cy="128" r="12" fill="#d7f56a" stroke="#1c3a32"/>
    <path d="M160 70 h40 l-8 -8 m8 8 l-8 8" stroke="#c45c26" stroke-width="3" fill="none"/>
    <text x="210" y="74" fill="#1c3a32" font-family="sans-serif" font-size="12">Fronts often go straight back</text>
    <text x="210" y="98" fill="#1c3a32" font-family="sans-serif" font-size="12">Rears often cross forward</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Directional tires and AWD follow their own pattern.</text>`),
  general: svg('Inspect, repair, verify', `
    <rect x="24" y="70" width="90" height="70" rx="8" fill="#1c3a32"/>
    <rect x="134" y="70" width="90" height="70" rx="8" fill="#c45c26"/>
    <rect x="244" y="70" width="90" height="70" rx="8" fill="#1c3a32"/>
    <text x="40" y="110" fill="#f4f7f4" font-family="sans-serif" font-size="13">Inspect</text>
    <text x="154" y="110" fill="#f4f7f4" font-family="sans-serif" font-size="13">Repair</text>
    <text x="264" y="110" fill="#f4f7f4" font-family="sans-serif" font-size="13">Verify</text>
    <text x="16" y="196" fill="#3d5148" font-family="sans-serif" font-size="11">Torque and fluids come from service information for this VIN.</text>`),
};

export function repairFamily(repair) {
  const text = String(repair || '').toLowerCase();
  if (/brake fluid|fluid flush/.test(text) && /brake|fluid/.test(text)) return 'brake-flush';
  if (/no-start|no start|won't start|wont start|crank/.test(text)) return 'nostart';
  if (/brake|rotor|pad|caliper/.test(text)) return 'brakes';
  if (/water pump|thermostat|coolant|radiator/.test(text)) return 'cooling';
  if (/transmission|atf/.test(text)) return 'transmission';
  if (/differential|gear oil/.test(text)) return 'differential';
  if (/spark plug|ignition coil|tune-up|tune up/.test(text)) return 'ignition';
  if (/serpentine|drive belt/.test(text) || (/\bbelt\b/.test(text) && !/seat/.test(text))) return 'belt';
  if (/cabin|pollen/.test(text)) return 'cabin-filter';
  if (/air filter/.test(text)) return 'air-filter';
  if (/wiper/.test(text)) return 'wipers';
  if (/rotat/.test(text) && /tire|wheel/.test(text)) return 'rotation';
  if (/battery/.test(text)) return 'battery';
  if (/injector|fuel system|induction/.test(text)) return 'fuel';
  if (/oil/.test(text)) return 'oil';
  if (/call-out|call out|no-access|no access/.test(text)) return 'callout';
  return 'general';
}

export function youtubeSearchUrl(query) {
  const search = new URL('https://www.youtube.com/results');
  search.searchParams.set('search_query', String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180));
  return search.href;
}

export function safeVideoUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com' || parsed.pathname !== '/results') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export function repairDiagram(key) {
  return DIAGRAMS[key] || DIAGRAMS.general;
}

export function stepText(step) {
  if (!step || typeof step === 'string') return String(step || '');
  const watch = step.watch ? ` Watch for: ${step.watch}` : '';
  return `${step.title}. ${step.detail}${watch}`;
}

export function buildRepairGuide(vehicle, repair) {
  const familyId = repairFamily(repair);
  const family = FAMILIES[familyId];
  const vehicleName = String(vehicle || '').trim() || 'the vehicle';
  const repairName = String(repair || '').trim() || 'the requested repair';
  const videos = [
    { label: `${vehicleName} ${repairName}`, query: `${vehicleName} ${repairName} repair procedure` },
    ...family.videos.map(topic => ({ label: topic, query: `${vehicleName} ${topic}` })),
  ].map(item => ({ label: item.label, url: youtubeSearchUrl(item.query) }));
  return {
    kind: 'guide',
    family: familyId,
    vehicle: vehicleName,
    repair: repairName,
    title: `${repairName} — ${vehicleName}`,
    difficulty: family.difficulty,
    time: family.time,
    diagram: family.diagram,
    tools: family.tools,
    parts: family.parts,
    steps: family.steps,
    safety: family.safety,
    videos,
    tips: ['Photograph connectors and routing before they are disturbed.', 'Write measurements on the repair order, not only in your head.'],
    postRepair: [
      'The original complaint is gone under the same conditions, or the reason it could not be verified is written down.',
      'Fluid level, leaks, warning lights, and lug torque are checked after the repair.',
      'Codes were cleared only if the procedure allowed it, and a rescan is saved.',
    ],
    note: 'Diagrams show the layout of the job. Torque, fluid type, bleed order, and one-time-use parts come from current service information for this VIN. Video links open a YouTube search for this vehicle and procedure.',
  };
}
