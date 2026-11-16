"""Editable, original Blender assets for Dream Garage. Run with Blender --background --python."""
import bpy, math, os, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'garage', 'assets')
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != 'Collection': bpy.data.collections.remove(col)
MAT = {}
def material(name, color, metal=0, rough=.5, emission=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1); bsdf.inputs['Metallic'].default_value = metal; bsdf.inputs['Roughness'].default_value = rough
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1); bsdf.inputs['Emission Strength'].default_value = emission
    MAT[name] = m; return m
concrete=material('Concrete graphite', (.065,.078,.076),0,.83)
steel=material('Powder coated steel',(.042,.061,.062),.65,.4)
edge=material('Machined steel',(.17,.21,.20),.8,.32)
silver=material('Brushed aluminum',(.48,.55,.56),.85,.27)
rubber=material('Soft rubber',(.012,.016,.017),0,.85)
red=material('Workshop vermilion',(.55,.07,.035),.45,.35)
lime=material('Acid lime',(.58,.78,.21),.25,.35)
amber=material('Safety amber',(.83,.43,.07),.3,.4)
blue=material('Anodized blue',(.055,.28,.47),.75,.23)
white=material('LED soft white',(.68,.80,.78),.3,.25,2.5)
glow=material('LED acid lime',(.52,.81,.19),.3,.25,2)
orangeglow=material('LED amber',(.96,.28,.04),.2,.3,1.8)
wood=material('Workshop timber',(.26,.16,.08),0,.8)
paint=material('body_paint',(.46,.63,.18),.5,.26)
current = None
def collection(name):
    global current
    current=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(current); return current
def move(obj,name,mat=None):
    obj.name=name
    for col in list(obj.users_collection): col.objects.unlink(obj)
    current.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj
def pos(v): return (v[0],-v[2],v[1])
def bevel(obj,r=.025):
    if r:
        mod=obj.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=r; mod.segments=2
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons: p.use_smooth=True
    try:
        normal=obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL'); normal.keep_sharp=True
    except: pass
    return obj
def box(name,size,p,mat,r=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p)); obj=move(bpy.context.object,name,mat); obj.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); return bevel(obj,r)
def cyl(name,radius,height,p,mat,axis='y',vertices=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=height,location=pos(p)); obj=move(bpy.context.object,name,mat)
    if axis=='x': obj.rotation_euler[1]=math.pi/2
    if axis=='z': obj.rotation_euler[0]=math.pi/2
    return bevel(obj,.008)
def torus(name,major,minor,p,mat,axis='y'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=48,minor_segments=10,location=pos(p)); obj=move(bpy.context.object,name,mat)
    if axis=='x':obj.rotation_euler[1]=math.pi/2
    if axis=='z':obj.rotation_euler[0]=math.pi/2
    for poly in obj.data.polygons:poly.use_smooth=True
    return obj
def tube(name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.bevel_depth=radius;curve.bevel_resolution=3
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for point,v in zip(spline.points,points):point.co=(*pos(v),1)
    obj=bpy.data.objects.new(name,curve); current.objects.link(obj);obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False);return obj
def export(col,filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.all_objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,filename),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False)

garage=collection('WORKSHOP / modular architecture')
box('Sealed concrete floor',(25,.15,22),(0,-.16,0),concrete)
box('Rear concrete wall',(22,6,.24),(0,2.9,-7),concrete)
box('Left workshop wall',(.2,5.4,15),(-9,2.6,-.5),concrete)
for x in [-8,-4,0,4,8]:
    box('Steel wall pier',(.15,5.8,.3),(x,2.8,-6.8),steel)
    box('Wall amber guidance',(2.6,.028,.03),(x+1.6,1.25,-6.82),orangeglow,0)
for x in [-7,7]:
    for z in [-5,4]:
        box('Structural I beam',(.22,5.8,.2),(x,2.9,z),steel)
        box('Column footing',(.48,.24,.45),(x,.06,z),edge)
        for j in range(3):box('Hazard band',(.235,.09,.215),(x,.55+j*.23,z),amber,.002)
    box('Roof rail',(.23,.25,12),(x,5.7,-.5),steel)
for z in [-4,0,4]:
    box('Ceiling cross beam',(14,.13,.12),(0,5.6,z),steel)
    for x in [-4.6,4.6]:box('Suspended strip light',(3.6,.08,.12),(x,5.4,z),white,.01)
# Roller shutter with individual corrugations.
box('Loading bay door',(5.4,4.4,.1),(3.6,2.13,-6.8),steel)
for y in range(18):box('Shutter corrugation',(5.25,.025,.045),(3.6,.08+y*.24,-6.72),edge,.006)
box('Loading door header',(5.8,.15,.22),(3.6,4.4,-6.65),orangeglow)
for x in [.75,6.45]:box('Door upright',(.13,4.55,.23),(x,2.16,-6.65),edge)
# Circular service platform, floor joints and perimeter markings.
cyl('Service platform',3.87,.13,(0,-.035,0),steel,vertices=128)
cyl('Turntable top',3.79,.025,(0,.043,0),edge,vertices=128)
torus('Lime platform trim',3.82,.011,(0,.06,0),glow)
for n in range(48):
    a=n/48*math.tau; o=box('Platform index',(.013,.006,.16 if n%4==0 else .07),(math.sin(a)*3.56,.059,math.cos(a)*3.56),silver,0); o.rotation_euler[2]=-a
for x in [-8,-4,0,4,8]:box('Floor expansion joint',(.013,.004,20),(x,-.078,0),steel,0)
for z in [-8,-4,0,4,8]:box('Floor expansion joint',(24,.004,.013),(0,-.078,z),steel,0)
for x in [-5,5]:
    box('Lift base',(.5,.08,4.6),(x,.02,.2),steel)
    box('Lift post',(.32,3.4,.38),(x,1.7,-1.4),edge)
    box('Lift safety stripe',(.34,1.4,.035),(x,1.1,-1.19),amber,.004)
    arm=box('Lift arm',(1.8,.12,.17),(x*.83,.18,-.8),steel)
    arm.rotation_euler[2]=.3 if x<0 else -.3
# Cabinets, pegboard and loose workshop tools.
for x in [-6.6,-4.4]:
    box('Tool cabinet',(1.85,.95,.72),(x,.46,-5.6),steel)
    box('Worktop',(2,.08,.86),(x,1,-5.6),wood)
    for i in range(5):
        box('Drawer front',(1.7,.135,.02),(x,.12+i*.18,-5.22),edge,.007)
        box('Drawer pull',(.65,.018,.03),(x,.16+i*.18,-5.18),silver,.005)
box('Pegboard',(4.2,1.5,.06),(-5.5,2.1,-6.65),steel)
for i in range(8):
    x=-7+i*.42
    box('Hanging wrench',(.045,.43,.025),(x,2.16,-6.55),silver,.012)
    torus('Wrench head',.065,.018,(x,2.42,-6.55),silver,'z')
for i in range(3):torus('Stacked spare tire',.37,.14,(-6.8,.13+i*.28,-2.8),rubber)
for z in [-3.5,-2.8]:
    cyl('Oil barrel',.34,.95,(6.5,.42,z),blue)
    for h in [.1,.75]:torus('Barrel rolling hoop',.344,.014,(6.5,h,z),silver)
box('Parts trolley',(1,.13,.6),(6.1,.85,.1),red)
box('Trolley lower tray',(1,.1,.6),(6.1,.2,.1),steel)
for x in [5.68,6.52]:
    for z in [-.12,.32]:
        box('Trolley leg',(.04,.75,.04),(x,.5,z),silver)
        torus('Trolley caster',.065,.025,(x,.09,z),rubber,'z')
for i in range(4):box('Pallet slat',(1.6,.07,.12),(-6.7,.04,2.1+i*.2),wood)
box('Shipping crate',(1.2,.75,.7),(-6.7,.43,2.4),wood)
for x in [-7.18,-6.22]:box('Crate band',(.04,.76,.71),(x,.43,2.4),steel,.005)
export(garage,'workshop.glb')

district=collection('DISTRICT / six playable destinations')
box('District ground',(32,.35,26),(0,-.3,0),concrete)
box('East west arterial',(31,.03,3.6),(0,-.08,0),steel,0)
box('North south arterial',(3.6,.03,25),(0,-.075,0),steel,0)
for x in range(-14,15,3):box('Lane divider',(.9,.015,.045),(x,-.048,0),amber,0)
for z in range(-11,12,3):box('Lane divider',(.045,.015,.9),(0,-.048,z),amber,0)
locations=[('workshop',-7,-5,5,3.1,4,lime),('parts',6,-6,6,2.5,4,blue),('paint',-7,6,5,2.4,3,amber),('dyno',6,6,5,3.8,4,red),('track',12,1,3,1.2,8,silver),('showroom',-13,1,3,3.2,6,lime)]
for identity,x,z,w,h,d,color in locations:
    before=set(district.objects)
    box('Building '+identity,(w,h,d),(x,h/2,z),steel,.07)
    box('Roof '+identity,(w+.2,.16,d+.2),(x,h+.06,z),edge)
    box('Destination neon '+identity,(w*.72,.08,.06),(x,h*.72,z+d/2+.04),color)
    box('Front glazing '+identity,(w*.7,h*.45,.035),(x,h*.38,z+d/2+.025),blue)
    for sx in [-.27,.27]:box('Roof HVAC '+identity,(w*.2,.38,.7),(x+w*sx,h+.32,z),silver)
    box('Loading apron '+identity,(w+1,.05,1.3),(x,-.01,z+d/2+.7),edge)
    root=bpy.data.objects.new('destination_'+identity,None);district.objects.link(root)
    for obj in set(district.objects)-before:
        if obj!=root:obj.parent=root
    root['destination']=identity
for x,z in [(-3.1,-2.3),(3.1,2.3),(-3.1,9),(3.1,-10)]:
    cyl('Street light post',.035,2.8,(x,1.4,z),silver,vertices=12)
    box('Street light head',(.4,.06,.18),(x,2.82,z),white)
for x,z in [(-10,-10),(9,10),(11,-10),(-10,10)]:
    for i in range(3):box('Shipping container',(2.7,.65,1.1),(x,.3+i*.65,z),blue if i%2 else red)
export(district,'district.glb')

coach=collection('COACHWORK / sculpted replacement body')
outline=[(-2.64,.43),(-2.12,.43)]
for center in [-1.57,1.57]:
    if center>0:outline.append((center-.55,.44))
    for i in range(21):
        a=math.pi-i/20*math.pi;outline.append((center+math.cos(a)*.55,.44+math.sin(a)*.55))
outline += [(2.58,.43),(2.63,.57),(2.63,.87),(2.55,1.02),(2.34,1.08),(1.38,1.12),(.4,1.12),(-.95,1.13),(-1.75,1.09),(-2.43,1.04),(-2.61,.98),(-2.65,.8)]
verts=[]; rings=[-1,-.985,-.94,-.78,0,.78,.94,.985,1]
for z in rings:
    for x,y in outline:
        upper=max(0,min(1,(y-.8)/.3));yy=y+upper*.038*(1-abs(z)**4)
        xx=x*(1-.015*abs(z)**6)
        verts.append(pos((xx,yy,z)))
faces=[];n=len(outline)
for ring in range(len(rings)-1):
    for j in range(n):faces.append((ring*n+j,ring*n+(j+1)%n,(ring+1)*n+(j+1)%n,(ring+1)*n+j))
faces += [tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))]
mesh=bpy.data.meshes.new('Curved coachwork topology');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('body_shell',mesh);coach.objects.link(obj);obj.data.materials.append(paint)
bevel(obj,.012)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
export(coach,'coachwork.glb')

parts=collection('PARTS / original component library')
groups={}
def begin_part(identity):
    root=bpy.data.objects.new('part_'+identity,None);parts.objects.link(root);groups[identity]=[root];return set(parts.objects),root
def end_part(before,root):
    for obj in set(parts.objects)-before:
        if obj!=root:obj.parent=root;groups[root.name[5:]].append(obj)
before,root=begin_part('turbo')
torus('Compressor snail',.34,.14,(0,.45,0),silver,'z');cyl('Compressor inlet',.24,.25,(0,.45,.2),silver,'z');cyl('Dark turbine opening',.185,.015,(0,.45,.33),rubber,'z')
for i in range(9):
    a=i/9*math.tau;o=box('Turbine blade',(.035,.3,.035),(math.sin(a)*.1,.45+math.cos(a)*.1,.34),silver,.008);o.rotation_euler[1]=a
tube('Charge pipe',[(.32,.6,0),(.54,.64,0),(.6,.6,.15),(.6,.52,.32)],.085,silver);end_part(before,root)
before,root=begin_part('wheels')
torus('Forged outer lip',.46,.035,(0,.5,0),silver,'z');torus('Forged inner lip',.43,.025,(0,.5,-.22),silver,'z');cyl('Wheel hub',.085,.15,(0,.5,0),silver,'z')
for i in range(10):
    a=i/10*math.tau;o=box('Forged spoke',(.045,.4,.05),(math.sin(a)*.23,.5+math.cos(a)*.23,0),amber,.009);o.rotation_euler[1]=a
end_part(before,root)
before,root=begin_part('tires')
torus('Performance tire',.38,.15,(0,.53,0),rubber,'z')
for z in [-.09,0,.09]:torus('Tread channel',.523,.007,(0,.53,z),edge,'z')
end_part(before,root)
before,root=begin_part('brakes')
cyl('Vented disc',.42,.045,(0,.5,0),silver,'z');cyl('Rotor hat',.16,.1,(0,.5,.01),edge,'z')
for i in range(16):
    a=i/16*math.tau;cyl('Drilled rotor hole',.013,.005,(math.sin(a)*.32,.5+math.cos(a)*.32,.026),rubber,'z',12)
box('Six piston caliper',(.17,.5,.19),(.33,.55,.06),red,.055);end_part(before,root)
before,root=begin_part('suspension')
cyl('Damper body',.11,.65,(0,.43,0),blue);cyl('Polished damper rod',.045,.4,(0,.87,0),silver)
points=[]
for i in range(241):
    a=i/240*math.tau*7;points.append((math.cos(a)*.16,.16+i/240*.7,math.sin(a)*.16))
tube('Coil spring',points,.024,amber);cyl('Upper spring perch',.2,.04,(0,.91,0),silver);end_part(before,root)
before,root=begin_part('exhaust')
cyl('Titanium muffler',.18,.6,(0,.3,0),silver,'x');tube('Bent tailpipe',[(.2,.3,0),(.6,.3,0),(.75,.35,.15),(.95,.35,.15)],.09,blue);torus('Burnt titanium lip',.092,.013,(.95,.35,.15),silver,'x');end_part(before,root)
before,root=begin_part('nitrous')
cyl('Nitrous bottle',.23,.7,(0,.42,0),blue);cyl('Bottle shoulder',.17,.12,(0,.82,0),blue);cyl('Brass valve',.07,.12,(0,.94,0),amber);box('Bottle label',(.27,.27,.015),(0,.43,.232),silver,.004);end_part(before,root)
before,root=begin_part('aero')
box('Carbon wing',(1.7,.065,.4),(0,.68,0),steel,.025)
for x in [-.55,.55]:box('Wing bracket',(.07,.55,.1),(x,.37,0),silver)
for x in [-.86,.86]:box('Wing endplate',(.04,.25,.46),(x,.68,0),steel)
end_part(before,root)
before,root=begin_part('paint')
cyl('Paint cup',.2,.35,(0,.77,0),silver);box('Spray body',(.55,.17,.15),(0,.49,0),silver,.04);cyl('Spray nozzle',.065,.14,(-.35,.49,0),amber,'x');o=box('Spray grip',(.12,.35,.12),(.13,.28,0),steel);o.rotation_euler[1]=-.2;end_part(before,root)
before,root=begin_part('transmission')
cyl('Bell housing',.35,.42,(-.23,.4,0),silver,'x');box('Gearbox case',(.65,.43,.42),(.24,.4,0),silver,.07)
for x in [.05,.2,.35,.5]:box('Cooling rib',(.025,.49,.47),(x,.4,0),edge,.006)
cyl('Input shaft',.055,.28,(-.56,.4,0),edge,'x');end_part(before,root)
before,root=begin_part('ecu')
box('ECU housing',(.72,.18,.55),(0,.25,0),edge,.025)
for x in [-.26,-.13,0,.13,.26]:box('Heat sink rib',(.035,.06,.48),(x,.37,0),silver,.006)
for x in [-.22,.1]:box('Wiring connector',(.22,.14,.12),(x,.25,.32),rubber,.01)
box('Circuit label',(.23,.008,.15),(0,.405,0),lime,.005);end_part(before,root)
before,root=begin_part('cooling')
box('Radiator core',(1,.65,.12),(0,.42,0),silver,.01)
for i in range(16):box('Cooling fin',(.96,.012,.14),(0,.13+i*.037,0),edge,.001)
for x in [-.56,.56]:box('Radiator end tank',(.1,.74,.17),(x,.42,0),silver)
cyl('Coolant neck',.045,.12,(.55,.84,0),silver);end_part(before,root)
before,root=begin_part('lighting')
box('Headlight housing',(.95,.25,.2),(0,.35,0),steel,.045)
for x in [-.3,0,.3]:cyl('LED projector',.077,.035,(x,.35,.12),white,'z')
box('Daylight strip',(.82,.025,.015),(0,.43,.12),glow,.006);end_part(before,root)
export(parts,'parts.glb')

# Save the full editable source before rendering a consistent product thumbnail set.
bpy.ops.object.select_all(action='DESELECT')
for col in [district,coach,parts]:
    for obj in col.all_objects: obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'dream-garage-assets.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=360;scene.render.resolution_y=240;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.world.color=(.12,.12,.12)
for col in [garage,district,coach]:
    for obj in col.all_objects:obj.hide_render=True
for obj in parts.all_objects:obj.hide_render=True
bpy.ops.object.camera_add(location=(2.3,-3.8,2.2));cam=bpy.context.object;cam.name='Part catalog camera';scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.1
direction=Vector((0,0,.45))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
for location,power,size,color in [((1,-3,4),500,3,(.9,1,.85)),((-2,-1,2),350,2,(.65,.8,1)),((0,2,3),600,2,(1,.55,.25))]:
    bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.data.color=color;light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
for identity,objects in groups.items():
    for obj in objects:obj.hide_render=False
    scene.render.filepath=os.path.join(OUT,'part-'+identity+'.png');bpy.ops.render.render(write_still=True)
    for obj in objects:obj.hide_render=True
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump({'author':'Dream Garage / original procedural Blender models','models':['workshop.glb','district.glb','coachwork.glb','parts.glb'],'parts':list(groups),'source':'dream-garage-assets.blend'},f,indent=2)
print('DREAM GARAGE ASSETS COMPLETE: '+OUT)
