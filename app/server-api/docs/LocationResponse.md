# LocationResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**created_at** | **datetime** | Creation timestamp | [optional] 
**entity_id** | **str** | Entity UUID | [optional] 
**entity_type** | **str** | Entity type | [optional] 
**id** | **str** | Location report ID | [optional] 
**metadata** | **object** | Additional metadata | [optional] 
**node_id** | **str** | Node ID | [optional] 
**position** | [**Position**](Position.md) |  | [optional] 

## Example

```python
from nexum-api-client.models.location_response import LocationResponse

# TODO update the JSON string below
json = "{}"
# create an instance of LocationResponse from a JSON string
location_response_instance = LocationResponse.from_json(json)
# print the JSON string representation of the object
print LocationResponse.to_json()

# convert the object into a dict
location_response_dict = location_response_instance.to_dict()
# create an instance of LocationResponse from a dict
location_response_form_dict = location_response.from_dict(location_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


