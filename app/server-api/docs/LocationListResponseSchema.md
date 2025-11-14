# LocationListResponseSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**count** | **int** | Number of locations | [optional] 
**data** | [**List[LocationResponse]**](LocationResponse.md) | List of locations | [optional] 
**status** | **str** | Response status | [optional] 

## Example

```python
from nexum-api-client.models.location_list_response_schema import LocationListResponseSchema

# TODO update the JSON string below
json = "{}"
# create an instance of LocationListResponseSchema from a JSON string
location_list_response_schema_instance = LocationListResponseSchema.from_json(json)
# print the JSON string representation of the object
print LocationListResponseSchema.to_json()

# convert the object into a dict
location_list_response_schema_dict = location_list_response_schema_instance.to_dict()
# create an instance of LocationListResponseSchema from a dict
location_list_response_schema_form_dict = location_list_response_schema.from_dict(location_list_response_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


